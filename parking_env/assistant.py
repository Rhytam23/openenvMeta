from __future__ import annotations

from typing import Dict, List, Tuple

from .models import (
    AssistantHistoryEntry,
    AssistantPreset,
    AssistantState,
    ParkingLot,
    ParkingRecommendation,
    TripPreference,
)
from .geo import estimate_route_metrics, geocode_destination, haversine_km
from .providers import get_provider


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


def _destination(destination: str) -> Tuple[str, Tuple[float, float]]:
    return DESTINATIONS.get(destination.lower(), ("Downtown Core", DESTINATIONS["downtown"][1]))


def _resolve_destination(destination: str, destination_query: str | None = None) -> Tuple[str, Tuple[float, float], str, bool]:
    query = (destination_query or destination or "").strip()
    if query:
        try:
            label, coords, source = geocode_destination(query)
            return label, coords, source, True
        except Exception:
            pass
    if destination.lower() in DESTINATIONS:
        label, coords = DESTINATIONS[destination.lower()]
        return label, coords, "preset", False
    try:
        label, coords, source = geocode_destination(destination)
        return label, coords, source, True
    except Exception:
        label, coords = DESTINATIONS["downtown"]
        return label, coords, "fallback", False


def _score_lot(
    lot: ParkingLot,
    origin: Tuple[float, float],
    destination_point: Tuple[float, float],
    mode: str,
    preference: TripPreference,
) -> ParkingRecommendation:
    availability = lot.available_spots / max(1, lot.total_spots)
    origin_to_lot = estimate_route_metrics(origin, lot.position, "driving")
    lot_to_destination = estimate_route_metrics(lot.position, destination_point, "walking")
    distance_to_dest = lot_to_destination.distance_km
    distance_from_origin = origin_to_lot.distance_km
    travel_distance = distance_from_origin + distance_to_dest
    commute_pressure = distance_from_origin
    walk_penalty = max(0, lot.walk_minutes - 3) * (0.03 if mode == "walk" else 0.02)
    drive_minutes = max(lot.drive_minutes, round(origin_to_lot.duration_min))
    drive_penalty = drive_minutes * (0.02 if mode == "drive" else 0.01)
    price_penalty = min(lot.hourly_rate / 20.0, 0.2)
    scarcity_penalty = 0.25 if lot.available_spots <= 10 else 0.0
    confidence_bonus = lot.confidence * 0.18
    proximity_bonus = max(0.0, 0.42 - distance_to_dest * 0.08)
    reserve_bonus = 0.12 if lot.reservation_supported else 0.0
    cheapest_bonus = max(0.0, 0.12 - lot.hourly_rate / 100.0)
    closest_bonus = max(0.0, 0.2 - distance_to_dest * 0.12)
    drive_minutes = max(lot.drive_minutes, round(distance_from_origin * 2.2) + 2)
    estimated_total_minutes = drive_minutes + lot.walk_minutes

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
        score += max(0.0, 0.16 - distance_to_dest * 0.15)
    else:
        score += 0.05 if lot.reservation_supported else 0.0

    score = max(0.0, min(1.0, round(score, 4)))

    if lot.reservation_supported and lot.available_spots > 0:
        reason = f"{lot.name} balances access, confidence, and reserve support."
        tradeoff = f"{drive_minutes} min drive, {lot.walk_minutes} min walk, reservation available."
    elif preference == TripPreference.CHEAPEST:
        reason = f"{lot.name} keeps cost low for a budget-first trip."
        tradeoff = f"{drive_minutes} min drive, {lot.walk_minutes} min walk, walk-in only."
    elif preference == TripPreference.CLOSEST:
        reason = f"{lot.name} is the nearest practical option to the destination."
        tradeoff = f"{drive_minutes} min drive, {lot.walk_minutes} min walk, limited reserve support."
    else:
        reason = f"{lot.name} offers dependable access for a normal arrival."
        tradeoff = f"{drive_minutes} min drive, {lot.walk_minutes} min walk, no reservation."

    return ParkingRecommendation(
        lot=lot,
        score=score,
        reason=reason,
        tradeoff=tradeoff,
        distance_to_destination=round(distance_to_dest, 3),
        distance_from_origin=round(distance_from_origin, 3),
        travel_distance=round(travel_distance, 3),
        estimated_drive_minutes=drive_minutes,
        estimated_total_minutes=drive_minutes + lot.walk_minutes,
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
    destination_query: str | None = None,
) -> AssistantState:
    if not isinstance(preference, TripPreference):
        preference = TripPreference(preference)
    destination_label, destination_point, destination_source, custom_destination = _resolve_destination(destination, destination_query)
    origin = origin or (40.7138, -74.0065)
    provider = get_provider()
    snapshot = provider.snapshot(destination, mode, preference.value, refresh=refresh)
    lots = snapshot.lots
    route_probe = estimate_route_metrics(origin, destination_point, "driving" if mode == "drive" else "walking")
    provider_status = snapshot.provider_status
    provider_warning = snapshot.provider_warning
    if snapshot.live_data_enabled and snapshot.freshness_minutes >= 12 and provider_status == "healthy":
        provider_status = "degraded"
        provider_warning = provider_warning or "Live data is getting stale."
    if route_probe.source == "estimate":
        provider_warning = provider_warning or "Route service unavailable; using estimated travel times."
        if provider_status == "healthy":
            provider_status = "degraded"

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
        destination_source=destination_source,
        custom_destination=custom_destination,
        travel_mode=mode,
        preference=preference,
        origin=origin,
        total_lots=len(lots),
        open_lots=open_lots,
        data_source=snapshot.source_name,
        provider_name=snapshot.source_name,
        provider_status=provider_status,
        provider_warning=provider_warning,
        last_updated_at=snapshot.last_updated_at,
        freshness_minutes=snapshot.freshness_minutes,
        route_engine=route_probe.source.upper(),
        route_summary=_route_summary(destination_label, preference, mode),
        live_data_enabled=snapshot.live_data_enabled,
        presets=PRESETS,
        recent_searches=get_recent_searches(),
        best_option=best_option,
        recommendations=recommendations,
    )
    _record_history(state)
    return state.model_copy(update={"recent_searches": get_recent_searches()})
