from __future__ import annotations

from datetime import datetime, timezone
from random import Random
from typing import Dict, List, Optional, Tuple

from .models import (
    AssistantHistoryEntry,
    AssistantPreset,
    AssistantState,
    ParkingLot,
    ParkingRecommendation,
    TripPreference,
)


DESTINATIONS: Dict[str, Tuple[str, Tuple[float, float]]] = {
    "downtown": ("Downtown Core", (40.7128, -74.0060)),
    "stadium": ("Riverfront Stadium", (40.7290, -73.9965)),
    "hospital": ("City General Hospital", (40.7182, -74.0150)),
    "university": ("Westside University", (40.7295, -73.9934)),
    "airport": ("Metro Airport Terminal", (40.6413, -73.7781)),
}

PRESETS: List[AssistantPreset] = [
    AssistantPreset(
        id="commute",
        label="Commute",
        destination="downtown",
        mode="drive",
        preference=TripPreference.BALANCED,
        description="Balanced access for everyday workday parking.",
    ),
    AssistantPreset(
        id="event-night",
        label="Event Night",
        destination="stadium",
        mode="drive",
        preference=TripPreference.RESERVE,
        description="Favor reserve support and high availability for busy events.",
    ),
    AssistantPreset(
        id="hospital-visit",
        label="Hospital Visit",
        destination="hospital",
        mode="drive",
        preference=TripPreference.CLOSEST,
        description="Minimize walking and stop quickly near the entrance.",
    ),
    AssistantPreset(
        id="campus-day",
        label="Campus Day",
        destination="university",
        mode="walk",
        preference=TripPreference.CHEAPEST,
        description="Lower-cost lots with a short walk across campus.",
    ),
    AssistantPreset(
        id="airport-trip",
        label="Airport Trip",
        destination="airport",
        mode="drive",
        preference=TripPreference.RESERVE,
        description="Reserve-first trip planning for longer journeys.",
    ),
]

_HISTORY: List[AssistantHistoryEntry] = []


def _seed() -> Random:
    return Random(42)


def _base_lots() -> List[ParkingLot]:
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
        lot.available_spots = max(0, min(lot.total_spots, lot.available_spots))
    return lots


def _destination(destination: str) -> Tuple[str, Tuple[float, float]]:
    return DESTINATIONS.get(destination.lower(), ("Downtown Core", DESTINATIONS["downtown"][1]))


def _distance(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _score_lot(
    lot: ParkingLot,
    origin: Tuple[float, float],
    destination_point: Tuple[float, float],
    mode: str,
    preference: TripPreference,
) -> ParkingRecommendation:
    availability = lot.available_spots / max(1, lot.total_spots)
    distance_to_dest = _distance(lot.position, destination_point)
    commute_pressure = _distance(lot.position, origin)
    walk_penalty = max(0, lot.walk_minutes - 3) * (0.03 if mode == "walk" else 0.02)
    drive_penalty = lot.drive_minutes * (0.02 if mode == "drive" else 0.01)
    price_penalty = min(lot.hourly_rate / 20.0, 0.2)
    scarcity_penalty = 0.25 if lot.available_spots <= 10 else 0.0
    confidence_bonus = lot.confidence * 0.18
    proximity_bonus = max(0.0, 0.35 - distance_to_dest * 0.01)
    reserve_bonus = 0.12 if lot.reservation_supported else 0.0
    cheapest_bonus = max(0.0, 0.12 - lot.hourly_rate / 100.0)
    closest_bonus = max(0.0, 0.15 - distance_to_dest * 0.35)

    score = (
        availability * 0.34
        + confidence_bonus
        + proximity_bonus
        + reserve_bonus
        + cheapest_bonus * (0.6 if preference == TripPreference.CHEAPEST else 0.3)
        + closest_bonus * (0.6 if preference == TripPreference.CLOSEST else 0.25)
        - drive_penalty
        - walk_penalty
        - price_penalty
        - scarcity_penalty
        - commute_pressure * 0.005
    )

    if preference == TripPreference.RESERVE:
        score += 0.08 if lot.reservation_supported else -0.08
    elif preference == TripPreference.CHEAPEST:
        score += max(0.0, 0.16 - lot.hourly_rate / 50.0)
    elif preference == TripPreference.CLOSEST:
        score += max(0.0, 0.14 - distance_to_dest * 0.2)
    else:
        score += 0.05 if lot.reservation_supported else 0.0

    score = max(0.0, min(1.0, round(score, 4)))
    estimated_total_minutes = lot.drive_minutes + lot.walk_minutes

    if lot.reservation_supported and lot.available_spots > 0:
        reason = f"{lot.name} balances access, confidence, and reserve support."
        tradeoff = f"{lot.walk_minutes} min walk, ${lot.hourly_rate:.2f}/hr, reservation available."
    elif preference == TripPreference.CHEAPEST:
        reason = f"{lot.name} keeps cost low for a budget-first trip."
        tradeoff = f"{lot.walk_minutes} min walk, ${lot.hourly_rate:.2f}/hr, walk-in only."
    elif preference == TripPreference.CLOSEST:
        reason = f"{lot.name} is the nearest practical option to the destination."
        tradeoff = f"{lot.walk_minutes} min walk, ${lot.hourly_rate:.2f}/hr, limited reserve support."
    else:
        reason = f"{lot.name} offers dependable access for a normal arrival."
        tradeoff = f"{lot.walk_minutes} min walk, ${lot.hourly_rate:.2f}/hr, no reservation."

    return ParkingRecommendation(
        lot=lot,
        score=score,
        reason=reason,
        tradeoff=tradeoff,
        distance_to_destination=round(distance_to_dest, 4),
        estimated_total_minutes=estimated_total_minutes,
    )


def _route_summary(destination_label: str, preference: TripPreference, mode: str) -> str:
    if preference == TripPreference.RESERVE:
        focus = "reserve-first"
    elif preference == TripPreference.CHEAPEST:
        focus = "cost-first"
    elif preference == TripPreference.CLOSEST:
        focus = "closest-first"
    else:
        focus = "balanced"
    return f"{mode.title()} trip to {destination_label} using a {focus} parking strategy."


def _record_history(state: AssistantState) -> None:
    best_lot = state.best_option.lot.name if state.best_option else None
    entry = AssistantHistoryEntry(
        destination=state.destination,
        destination_label=state.destination_label,
        mode=state.travel_mode,
        preference=state.preference,
        best_lot=best_lot,
        score=state.best_option.score if state.best_option else 0.0,
        searched_at=state.last_updated_at,
    )
    _HISTORY.insert(0, entry)
    del _HISTORY[6:]


def get_recent_searches() -> List[AssistantHistoryEntry]:
    return list(_HISTORY)


def build_assistant_state(
    destination: str,
    mode: str = "drive",
    origin: Tuple[float, float] | None = None,
    refresh: bool = False,
    preference: TripPreference = TripPreference.BALANCED,
) -> AssistantState:
    destination_label, destination_point = _destination(destination)
    origin = origin or (40.7138, -74.0065)
    lots = _base_lots()
    if refresh:
        rnd = Random(f"{destination}:{mode}:{preference.value}")
        for lot in lots:
            delta = rnd.randint(-8, 8)
            lot.available_spots = max(0, min(lot.total_spots, lot.available_spots + delta))
            lot.confidence = max(0.55, min(0.99, round(lot.confidence + rnd.uniform(-0.04, 0.04), 2)))

    recommendations = sorted(
        [_score_lot(lot, origin, destination_point, mode, preference) for lot in lots],
        key=lambda item: item.score,
        reverse=True,
    )
    open_lots = sum(1 for lot in lots if lot.available_spots > 0)
    best_option = recommendations[0] if recommendations else None
    state = AssistantState(
        destination=destination.lower(),
        destination_label=destination_label,
        destination_position=destination_point,
        travel_mode=mode,
        preference=preference,
        origin=origin,
        total_lots=len(lots),
        open_lots=open_lots,
        data_source="Demo feed",
        last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        freshness_minutes=5 if refresh else 15,
        route_summary=_route_summary(destination_label, preference, mode),
        presets=PRESETS,
        recent_searches=get_recent_searches(),
        best_option=best_option,
        recommendations=recommendations,
    )
    _record_history(state)
    return state.model_copy(update={"recent_searches": get_recent_searches()})
