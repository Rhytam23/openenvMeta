from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from random import Random
from typing import List, Protocol

from .models import ParkingLot


@dataclass(frozen=True)
class ParkingSnapshot:
    source_name: str
    last_updated_at: str
    freshness_minutes: int
    lots: List[ParkingLot]


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
        )


def get_provider() -> ParkingDataProvider:
    return DemoParkingProvider()


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
