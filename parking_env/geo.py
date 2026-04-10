from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen

_LOCALITY_HINTS = (
    "new delhi",
    "delhi",
    "mumbai",
    "bengaluru",
    "bangalore",
    "ahmedabad",
    "chennai",
    "hyderabad",
    "kolkata",
    "pune",
    "gurugram",
    "gurgaon",
)


@dataclass(frozen=True)
class RouteMetrics:
    distance_km: float
    duration_min: float
    source: str


def parse_coordinates(value: str) -> Tuple[float, float] | None:
    try:
        lat_str, lng_str = [part.strip() for part in value.split(",", 1)]
        return float(lat_str), float(lng_str)
    except Exception:
        return None


@lru_cache(maxsize=256)
def geocode_destination(query: str) -> Tuple[str, Tuple[float, float], str]:
    return _geocode_destination(query.strip())


@lru_cache(maxsize=256)
def route_metrics(start: Tuple[float, float], end: Tuple[float, float], profile: str = "driving") -> RouteMetrics:
    url = os.environ.get("PARKING_ROUTE_SERVICE_URL", "https://router.project-osrm.org")
    path = f"/route/v1/{profile}/{start[1]},{start[0]};{end[1]},{end[0]}"
    data = _fetch_json(
        f"{url.rstrip('/')}{path}",
        params={"overview": "false", "alternatives": "false", "steps": "false"},
        headers={"User-Agent": os.environ.get("PARKING_HTTP_USER_AGENT", "OpenEnvParking/1.0")},
    )
    routes = data.get("routes") if isinstance(data, dict) else None
    if routes:
        route = routes[0]
        return RouteMetrics(
            distance_km=float(route["distance"]) / 1000.0,
            duration_min=float(route["duration"]) / 60.0,
            source="osrm",
        )
    raise ValueError("Route service returned no routes.")


def estimate_route_metrics(start: Tuple[float, float], end: Tuple[float, float], profile: str = "driving") -> RouteMetrics:
    try:
        return route_metrics(start, end, profile)
    except Exception:
        km = haversine_km(start, end)
        minutes = (km / 40.0) * 60 if profile == "driving" else (km / 4.8) * 60
        return RouteMetrics(distance_km=round(km, 3), duration_min=round(minutes, 1), source="estimate")


def _geocode_destination(query: str) -> Tuple[str, Tuple[float, float], str]:
    if not query:
        raise ValueError("Destination query is empty.")
    coords = parse_coordinates(query)
    if coords:
        return query, coords, "coordinates"
    if os.environ.get("PARKING_GEOCODER_URL"):
        data = _fetch_json(
            os.environ["PARKING_GEOCODER_URL"],
            params={"q": query, "format": "jsonv2", "limit": "1"},
        )
        item = (data or [{}])[0]
        lat = float(item["lat"])
        lng = float(item["lon"])
        label = item.get("display_name") or query
        return label, (lat, lng), "geocoder"
    data = _fetch_json(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "jsonv2", "limit": "1"},
        headers={"User-Agent": os.environ.get("PARKING_HTTP_USER_AGENT", "OpenEnvParking/1.0")},
    )
    item = (data or [{}])[0]
    if not item:
        raise ValueError(f"Could not resolve destination: {query}")
    lat = float(item["lat"])
    lng = float(item["lon"])
    label = _compact_label(query, item.get("display_name") or query)
    return label, (lat, lng), "nominatim"


def haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lng1 = a
    lat2, lng2 = b
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    h = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _fetch_json(url: str, params: dict[str, str] | None = None, headers: dict[str, str] | None = None):
    query = f"?{urlencode(params)}" if params else ""
    request = Request(f"{url}{query}", headers=headers or {"Accept": "application/json"})
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _compact_label(query: str, label: str) -> str:
    parts = [part.strip() for part in label.split(",") if part.strip()]
    if not parts:
        return query.strip() or label
    if len(parts) == 1:
        return parts[0]
    head = parts[0]
    for part in parts[1:]:
        lower = part.lower()
        if any(hint in lower for hint in _LOCALITY_HINTS):
            return f"{head}, {part}"
    return f"{head}, {parts[1]}"
