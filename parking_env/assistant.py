from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Dict, List, Tuple

from .models import AssistantState, ParkingLot, ParkingRecommendation


DESTINATIONS: Dict[str, Tuple[str, Tuple[float, float]]] = {
    "downtown": ("Downtown Core", (40.7128, -74.0060)),
    "stadium": ("Riverfront Stadium", (40.7290, -73.9965)),
    "hospital": ("City General Hospital", (40.7182, -74.0150)),
    "university": ("Westside University", (40.7295, -73.9934)),
    "airport": ("Metro Airport Terminal", (40.6413, -73.7781)),
}


def _seed() -> Random:
    return Random(42)


def _base_lots() -> List[ParkingLot]:
    rnd = _seed()
    lots = [
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
        ),
    ]
    for lot in lots:
        # preserve deterministic base lots but keep counts in range
        lot.available_spots = max(0, min(lot.total_spots, lot.available_spots))
    return lots


def _destination(destination: str) -> Tuple[str, Tuple[float, float]]:
    return DESTINATIONS.get(destination.lower(), ("Downtown Core", DESTINATIONS["downtown"][1]))


def _score_lot(lot: ParkingLot, origin: Tuple[float, float], destination_point: Tuple[float, float], mode: str) -> ParkingRecommendation:
    availability = lot.available_spots / max(1, lot.total_spots)
    distance_to_dest = abs(lot.position[0] - destination_point[0]) + abs(lot.position[1] - destination_point[1])
    commute_pressure = abs(lot.position[0] - origin[0]) + abs(lot.position[1] - origin[1])
    walk_penalty = max(0, lot.walk_minutes - 3) * 0.025
    drive_penalty = lot.drive_minutes * 0.02 if mode == "drive" else lot.drive_minutes * 0.01
    price_penalty = min(lot.hourly_rate / 20.0, 0.2)
    scarcity_penalty = 0.25 if lot.available_spots <= 10 else 0.0
    confidence_bonus = lot.confidence * 0.18
    proximity_bonus = max(0.0, 0.35 - distance_to_dest * 0.01)
    score = (
        availability * 0.34
        + confidence_bonus
        + proximity_bonus
        - drive_penalty
        - walk_penalty
        - price_penalty
        - scarcity_penalty
        - commute_pressure * 0.005
    )
    score = max(0.0, min(1.0, round(score, 4)))
    if lot.reservation_supported and lot.available_spots > 0:
        reason = f"Best balance of price, access, and reserve support near {lot.name}."
        tradeoff = f"{lot.walk_minutes} min walk, ${lot.hourly_rate:.2f}/hr, reservation available."
    else:
        reason = f"Strong fallback choice with predictable occupancy near {lot.name}."
        tradeoff = f"{lot.walk_minutes} min walk, ${lot.hourly_rate:.2f}/hr, no reservation."
    return ParkingRecommendation(lot=lot, score=score, reason=reason, tradeoff=tradeoff)


def build_assistant_state(destination: str, mode: str = "drive", origin: Tuple[float, float] | None = None, refresh: bool = False) -> AssistantState:
    destination_label, destination_point = _destination(destination)
    origin = origin or (40.7138, -74.0065)
    lots = _base_lots()
    if refresh:
        rnd = Random(f"{destination}:{mode}")
        for lot in lots:
            delta = rnd.randint(-8, 8)
            lot.available_spots = max(0, min(lot.total_spots, lot.available_spots + delta))
            lot.confidence = max(0.55, min(0.99, round(lot.confidence + rnd.uniform(-0.04, 0.04), 2)))

    recommendations = sorted(
        [_score_lot(lot, origin, destination_point, mode) for lot in lots],
        key=lambda item: item.score,
        reverse=True,
    )
    open_lots = sum(1 for lot in lots if lot.available_spots > 0)
    best_option = recommendations[0] if recommendations else None
    return AssistantState(
        destination=destination.lower(),
        destination_label=destination_label,
        travel_mode=mode,
        origin=origin,
        total_lots=len(lots),
        open_lots=open_lots,
        best_option=best_option,
        recommendations=recommendations,
    )
