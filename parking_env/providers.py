from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from random import Random
from typing import Any, List, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .models import ParkingLot


@dataclass(frozen=True)
class ParkingSnapshot:
    source_name: str
    last_updated_at: str
    freshness_minutes: int
    lots: List[ParkingLot]
    live_data_enabled: bool


class ParkingDataProvider(Protocol):
    def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot: ...


class DemoParkingProvider:
    def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
        lots = _base_lots()
        if refresh:
            rnd = Random(f"{destination}:{mode}:{preference}")
            for lot in lots:
                delta = rnd.randint(-8, 8)
                lot.available_spots = max(0, min(lot.total_spots, lot.available_spots + delta))
                lot.confidence = max(0.55, min(0.99, round(lot.confidence + rnd.uniform(-0.04, 0.04), 2)))
        return ParkingSnapshot(
            source_name="Demo feed",
            last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            freshness_minutes=5 if refresh else 15,
            lots=lots,
            live_data_enabled=False,
        )


class LiveParkingProvider:
    def __init__(self, feed_url: str, api_key: str | None = None, provider_name: str = "Live feed"):
        self.feed_url = feed_url
        self.api_key = api_key
        self.provider_name = provider_name

    def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
        url = self.feed_url
        if "{destination}" in url:
            url = url.format(destination=destination, mode=mode, preference=preference, refresh=str(refresh).lower())
        if "?" not in url:
            url = f"{url}?{urlencode({'destination': destination, 'mode': mode, 'preference': preference, 'refresh': str(refresh).lower()})}"
        payload = _fetch_json(url, self.api_key)
        lots = _lots_from_payload(payload)
        return ParkingSnapshot(
            source_name=self.provider_name,
            last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            freshness_minutes=1 if refresh else 3,
            lots=lots,
            live_data_enabled=True,
        )


def get_provider() -> ParkingDataProvider:
    feed_url = os.environ.get("PARKING_LIVE_FEED_URL", "").strip()
    if feed_url:
        return LiveParkingProvider(
            feed_url=feed_url,
            api_key=os.environ.get("PARKING_LIVE_API_KEY") or None,
            provider_name=os.environ.get("PARKING_LIVE_PROVIDER_NAME", "Live feed"),
        )
    return DemoParkingProvider()


def _fetch_json(url: str, api_key: str | None = None) -> Any:
    headers = {
        "Accept": "application/json",
        "User-Agent": os.environ.get("PARKING_HTTP_USER_AGENT", "OpenEnvParking/1.0"),
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _lots_from_payload(payload: Any) -> List[ParkingLot]:
    raw_lots = payload.get("lots") if isinstance(payload, dict) else payload
    if not isinstance(raw_lots, list):
        raise ValueError("Parking feed must return a list of lots or an object with a 'lots' array.")
    lots: List[ParkingLot] = []
    for item in raw_lots:
        if not isinstance(item, dict):
            continue
        position = _extract_position(item)
        if position is None:
            continue
        lots.append(
            ParkingLot(
                id=str(item.get("id") or item.get("name") or len(lots)),
                name=str(item.get("name") or "Lot"),
                address=str(item.get("address") or item.get("formatted_address") or "Unknown"),
                position=position,
                total_spots=int(item.get("total_spots") or item.get("capacity") or 0),
                available_spots=int(item.get("available_spots") or item.get("available") or 0),
                hourly_rate=float(item.get("hourly_rate") or item.get("price_per_hour") or 0.0),
                walk_minutes=int(item.get("walk_minutes") or item.get("walk") or 0),
                drive_minutes=int(item.get("drive_minutes") or item.get("drive") or 0),
                confidence=float(item.get("confidence") or 0.75),
                reservation_supported=bool(item.get("reservation_supported") or item.get("reservable") or item.get("bookable")),
                map_url=item.get("map_url"),
                booking_url=item.get("booking_url") or item.get("reservation_url"),
            )
        )
    if not lots:
        raise ValueError("Parking feed did not return any usable lots.")
    return lots


def _extract_position(item: dict[str, Any]) -> tuple[float, float] | None:
    raw_position = item.get("position") or item.get("coords")
    if isinstance(raw_position, (list, tuple)) and len(raw_position) >= 2:
        try:
            return float(raw_position[0]), float(raw_position[1])
        except (TypeError, ValueError):
            return None
    lat = item.get("lat")
    lng = item.get("lng")
    if lat is None or lng is None:
        return None
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None


def _base_lots() -> List[ParkingLot]:
    return [
        ParkingLot(
            id="lot-east-1",
            name="East Deck",
            address="18 East Plaza",
            position=(40.7143, -74.0020),
            total_spots=220,
            available_spots=74,
            hourly_rate=6.0,
            walk_minutes=4,
            drive_minutes=5,
            confidence=0.94,
            reservation_supported=True,
            map_url="https://www.google.com/maps/search/?api=1&query=18+East+Plaza",
            booking_url="https://www.google.com/search?q=East+Deck+parking+reservation",
        ),
        ParkingLot(
            id="lot-west-2",
            name="West Garage",
            address="41 Hudson Ave",
            position=(40.7098, -74.0128),
            total_spots=180,
            available_spots=38,
            hourly_rate=4.5,
            walk_minutes=7,
            drive_minutes=6,
            confidence=0.89,
            reservation_supported=True,
            map_url="https://www.google.com/maps/search/?api=1&query=41+Hudson+Ave",
            booking_url="https://www.google.com/search?q=West+Garage+parking+reservation",
        ),
        ParkingLot(
            id="lot-north-3",
            name="North Surface Lot",
            address="7 Liberty Park",
            position=(40.7198, -74.0019),
            total_spots=96,
            available_spots=9,
            hourly_rate=3.0,
            walk_minutes=9,
            drive_minutes=4,
            confidence=0.84,
            reservation_supported=False,
            map_url="https://www.google.com/maps/search/?api=1&query=7+Liberty+Park",
        ),
        ParkingLot(
            id="lot-south-4",
            name="South Tower Garage",
            address="300 River Road",
            position=(40.7065, -74.0050),
            total_spots=260,
            available_spots=112,
            hourly_rate=8.5,
            walk_minutes=3,
            drive_minutes=8,
            confidence=0.91,
            reservation_supported=True,
            map_url="https://www.google.com/maps/search/?api=1&query=300+River+Road",
            booking_url="https://www.google.com/search?q=South+Tower+Garage+parking+reservation",
        ),
        ParkingLot(
            id="lot-central-5",
            name="Central Plaza Parking",
            address="99 Central Ave",
            position=(40.7160, -74.0081),
            total_spots=140,
            available_spots=52,
            hourly_rate=7.0,
            walk_minutes=5,
            drive_minutes=3,
            confidence=0.97,
            reservation_supported=True,
            map_url="https://www.google.com/maps/search/?api=1&query=99+Central+Ave",
            booking_url="https://www.google.com/search?q=Central+Plaza+Parking+reservation",
        ),
        ParkingLot(
            id="lot-river-6",
            name="Riverfront Lot",
            address="201 Harbor Way",
            position=(40.7225, -74.0112),
            total_spots=110,
            available_spots=21,
            hourly_rate=5.0,
            walk_minutes=6,
            drive_minutes=7,
            confidence=0.87,
            reservation_supported=False,
            map_url="https://www.google.com/maps/search/?api=1&query=201+Harbor+Way",
        ),
    ]
