from __future__ import annotations

from uuid import uuid4
from typing import Dict, List, Tuple

from .models import (
    AssistantHistoryEntry,
    AssistantAlert,
    AssistantPreset,
    AssistantState,
    ParkingLot,
    ParkingRecommendation,
    TripPreference,
)
from .geo import estimate_route_metrics, geocode_destination, haversine_km
from .providers import get_provider


DESTINATIONS: Dict[str, Tuple[str, Tuple[float, float]]] = {
    "downtown": ("Connaught Place, New Delhi", (28.6315, 77.2167)),
    "stadium": ("Narendra Modi Stadium, Ahmedabad", (23.0790, 72.5988)),
    "hospital": ("AIIMS New Delhi", (28.5672, 77.2100)),
    "university": ("Indian Institute of Science, Bengaluru", (13.0216, 77.5678)),
    "airport": ("Indira Gandhi International Airport", (28.5562, 77.1000)),
}

PRESETS: List[AssistantPreset] = [
    AssistantPreset(
        id="commute",
        label="Commute",
        destination="downtown",
        mode="drive",
        preference=TripPreference.BALANCED,
        urgency=0.55,
        description="Balanced access for everyday workday parking.",
    ),
    AssistantPreset(
        id="event-night",
        label="Event Night",
        destination="stadium",
        mode="drive",
        preference=TripPreference.RESERVE,
        urgency=0.85,
        description="Favor reserve support and high availability for busy events.",
    ),
    AssistantPreset(
        id="hospital-visit",
        label="Hospital Visit",
        destination="hospital",
        mode="drive",
        preference=TripPreference.CLOSEST,
        urgency=0.8,
        description="Minimize walking and stop quickly near the entrance.",
    ),
    AssistantPreset(
        id="campus-day",
        label="Campus Day",
        destination="university",
        mode="walk",
        preference=TripPreference.CHEAPEST,
        urgency=0.35,
        description="Lower-cost lots with a short walk across campus.",
    ),
    AssistantPreset(
        id="airport-trip",
        label="Airport Trip",
        destination="airport",
        mode="drive",
        preference=TripPreference.RESERVE,
        urgency=0.75,
        description="Reserve-first trip planning for longer journeys.",
    ),
]

_HISTORY: List[AssistantHistoryEntry] = []


def _destination(destination: str) -> Tuple[str, Tuple[float, float]]:
    return DESTINATIONS.get(destination.lower(), ("Connaught Place, New Delhi", DESTINATIONS["downtown"][1]))


def _resolve_destination(destination: str, destination_query: str | None = None) -> Tuple[str, Tuple[float, float], str, bool]:
    query = (destination_query or "").strip()
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
    trip_urgency: float,
) -> ParkingRecommendation:
    availability = lot.available_spots / max(1, lot.total_spots)
    origin_to_lot = estimate_route_metrics(origin, lot.position, "driving")
    lot_to_destination = estimate_route_metrics(lot.position, destination_point, "walking")
    distance_to_dest = lot_to_destination.distance_km
    distance_from_origin = origin_to_lot.distance_km
    travel_distance = distance_from_origin + distance_to_dest
    commute_pressure = distance_from_origin
    demand_pressure = min(
        1.0,
        round(
            (1.0 - availability) * 0.54
            + max(0.0, 0.16 - lot.confidence) * 0.9
            + (0.12 if lot.reservation_supported else 0.18)
            + min(0.12, lot.hourly_rate / 80.0),
            4,
        ),
    )
    urgency_weight = 0.35 + trip_urgency * 0.65
    walk_penalty = max(0, lot.walk_minutes - 3) * (0.025 + trip_urgency * 0.02 if mode == "walk" else 0.018 + trip_urgency * 0.015)
    drive_minutes = max(lot.drive_minutes, round(origin_to_lot.duration_min))
    drive_penalty = drive_minutes * (0.016 + trip_urgency * 0.02 if mode == "drive" else 0.01 + trip_urgency * 0.01)
    price_penalty = min(lot.hourly_rate / 18.0, 0.22) * (0.8 + (1.0 - trip_urgency) * 0.4)
    scarcity_penalty = 0.22 + demand_pressure * 0.18 if lot.available_spots <= max(3, round(lot.total_spots * 0.08)) else demand_pressure * 0.08
    confidence_bonus = lot.confidence * 0.18 + (1.0 - demand_pressure) * 0.06
    proximity_bonus = max(0.0, 0.42 - distance_to_dest * 0.08)
    reserve_bonus = 0.12 if lot.reservation_supported else 0.0
    cheapest_bonus = max(0.0, 0.12 - lot.hourly_rate / 100.0)
    closest_bonus = max(0.0, 0.2 - distance_to_dest * 0.12)
    drive_minutes = max(lot.drive_minutes, round(distance_from_origin * 2.2) + 2)
    estimated_total_minutes = drive_minutes + lot.walk_minutes

    score = (
        availability * (0.28 + (1.0 - trip_urgency) * 0.12)
        + (1.0 - demand_pressure) * 0.22
        + confidence_bonus
        + proximity_bonus * urgency_weight
        + reserve_bonus * (0.45 + trip_urgency * 0.45)
        + cheapest_bonus * (0.7 if preference == TripPreference.CHEAPEST else 0.25 + (1.0 - trip_urgency) * 0.1)
        + closest_bonus * (0.7 if preference == TripPreference.CLOSEST else 0.2 + trip_urgency * 0.1)
        - drive_penalty
        - walk_penalty
        - price_penalty
        - scarcity_penalty
        - commute_pressure * 0.005
    )

    if preference == TripPreference.RESERVE:
        score += 0.12 if lot.reservation_supported else -0.1
    elif preference == TripPreference.CHEAPEST:
        score += max(0.0, 0.18 - lot.hourly_rate / 45.0)
    elif preference == TripPreference.CLOSEST:
        score += max(0.0, 0.18 - distance_to_dest * 0.15)
    else:
        score += 0.05 if lot.reservation_supported else 0.0

    if trip_urgency >= 0.7:
        score += 0.05 if lot.reservation_supported else -0.02
        score += max(0.0, 0.08 - distance_to_dest * 0.08)
    elif trip_urgency <= 0.3:
        score += max(0.0, 0.08 - lot.hourly_rate / 80.0)

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
        demand_pressure=round(demand_pressure, 4),
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
        id=uuid4().hex,
        destination=state.destination,
        destination_label=state.destination_label,
        destination_query=state.destination_query,
        mode=state.travel_mode,
        preference=state.preference,
        origin=state.origin,
        trip_urgency=state.trip_urgency,
        best_lot=best_lot,
        score=state.best_option.score if state.best_option else 0.0,
        searched_at=state.last_updated_at,
    )
    _HISTORY.insert(0, entry)
    del _HISTORY[6:]


def _stability_index(recommendations: List[ParkingRecommendation]) -> float:
    if not recommendations:
        return 0.0
    best_id = recommendations[0].lot.id
    lookback = _HISTORY[:5]
    if not lookback:
        return 0.5
    matches = sum(1 for item in lookback if item.best_lot == best_id)
    return max(0.0, min(1.0, round(matches / len(lookback), 4)))


def _build_alerts(
    provider_status: str,
    provider_warning: str | None,
    freshness_minutes: int,
    route_source: str,
    recommendations: List[ParkingRecommendation],
    trip_urgency: float,
) -> List[AssistantAlert]:
    alerts: List[AssistantAlert] = []
    if provider_status != "healthy":
        alerts.append(
            AssistantAlert(
                id="provider-status",
                severity="warning",
                title="Live data is degraded",
                detail=provider_warning or "The live parking feed is falling back to cached or demo data.",
            )
        )
    if freshness_minutes >= 12:
        alerts.append(
            AssistantAlert(
                id="freshness",
                severity="warning",
                title="Data is getting stale",
                detail="Refresh before you leave so the ranking reflects the latest availability.",
            )
        )
    if route_source != "OSRM":
        alerts.append(
            AssistantAlert(
                id="route-fallback",
                severity="info",
                title="Route timing is estimated",
                detail="The route service is unavailable, so travel times are based on a local estimate.",
            )
        )
    if recommendations:
        top = recommendations[0].lot
        if top.available_spots <= max(3, round(top.total_spots * 0.08)):
            alerts.append(
                AssistantAlert(
                    id="scarcity",
                    severity="warning",
                    title="Best lot is filling up",
                    detail=f"{top.name} only has {top.available_spots} open spots left.",
                )
            )
        if trip_urgency >= 0.7 and not top.reservation_supported:
            alerts.append(
                AssistantAlert(
                    id="reserve",
                    severity="info",
                    title="Reservation support is limited",
                    detail="High urgency trips work best when the top lot can be reserved ahead of time.",
                )
            )
    return alerts


def get_recent_searches() -> List[AssistantHistoryEntry]:
    return list(_HISTORY)


def build_assistant_state(
    destination: str,
    mode: str = "drive",
    origin: Tuple[float, float] | None = None,
    refresh: bool = False,
    preference: TripPreference = TripPreference.BALANCED,
    trip_urgency: float = 0.5,
    destination_query: str | None = None,
    record_history: bool = True,
) -> AssistantState:
    if not isinstance(preference, TripPreference):
        preference = TripPreference(preference)
    trip_urgency = max(0.0, min(1.0, float(trip_urgency)))
    destination_query_value = (destination_query or "").strip() or None
    destination_label, destination_point, destination_source, custom_destination = _resolve_destination(destination, destination_query)
    origin = origin or (28.6139, 77.2090)
    provider = get_provider()
    provider_destination = destination_query_value or destination_label
    snapshot = provider.snapshot(provider_destination, mode, preference.value, refresh=refresh)
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
        [_score_lot(lot, origin, destination_point, mode, preference, trip_urgency) for lot in lots],
        key=lambda item: item.score,
        reverse=True,
    )
    open_lots = sum(1 for lot in lots if lot.available_spots > 0)
    best_option = recommendations[0] if recommendations else None
    stability_index = _stability_index(recommendations)
    alerts = _build_alerts(provider_status, provider_warning, snapshot.freshness_minutes, route_probe.source.upper(), recommendations, trip_urgency)
    state = AssistantState(
        destination=destination.lower(),
        destination_label=destination_label,
        destination_position=destination_point,
        destination_source=destination_source,
        custom_destination=custom_destination,
        destination_query=destination_query_value,
        travel_mode=mode,
        preference=preference,
        trip_urgency=trip_urgency,
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
        stability_index=stability_index,
        alerts=alerts,
        presets=PRESETS,
        recent_searches=get_recent_searches(),
        best_option=best_option,
        recommendations=recommendations,
    )
    if record_history:
        _record_history(state)
    return state.model_copy(update={"recent_searches": get_recent_searches()})

