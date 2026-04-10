from __future__ import annotations

from datetime import datetime, timezone

from parking_env import assistant as assistant_module
from parking_env import geo as geo_module
from parking_env.models import ParkingLot
from parking_env.providers import ParkingSnapshot


def _reset_history() -> None:
    assistant_module._HISTORY.clear()


def test_presets_resolve_before_geocoding():
    _reset_history()
    label, coords, source, custom = assistant_module._resolve_destination("downtown")

    assert label == "Connaught Place, New Delhi"
    assert coords == (28.6315, 77.2167)
    assert source == "preset"
    assert custom is False


def test_demand_scoring_stays_bounded_and_changes_with_urgency():
    _reset_history()
    relaxed = assistant_module.build_assistant_state("downtown", trip_urgency=0.15)
    urgent = assistant_module.build_assistant_state("downtown", trip_urgency=0.9)

    assert 0.0 <= relaxed.stability_index <= 1.0
    assert 0.0 <= urgent.stability_index <= 1.0
    assert relaxed.trip_urgency == 0.15
    assert urgent.trip_urgency == 0.9
    assert all(0.0 <= rec.score <= 1.0 for rec in relaxed.recommendations)
    assert all(0.0 <= rec.demand_pressure <= 1.0 for rec in relaxed.recommendations)
    assert any(
        abs(low.score - high.score) > 0.0001 or low.lot.id != high.lot.id
        for low, high in zip(relaxed.recommendations, urgent.recommendations, strict=False)
    )


def test_custom_destination_query_drives_provider_and_history(monkeypatch):
    _reset_history()
    captured: list[str] = []

    class CaptureProvider:
        def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
            del mode, preference, refresh
            captured.append(destination)
            lot = ParkingLot(
                id="demo-lot",
                name="Demo Lot",
                address="1 Demo Way",
                position=(28.61, 77.2),
                total_spots=20,
                available_spots=8,
                hourly_rate=10.0,
                walk_minutes=6,
                drive_minutes=4,
                confidence=0.9,
                reservation_supported=True,
            )
            return ParkingSnapshot(
                source_name="Mock feed",
                provider_status="healthy",
                provider_warning=None,
                last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                freshness_minutes=3,
                lots=[lot],
                live_data_enabled=True,
            )

    monkeypatch.setattr(assistant_module, "geocode_destination", lambda query: ("India Gate, New Delhi", (28.6129, 77.2295), "mock"))
    monkeypatch.setattr(assistant_module, "get_provider", lambda: CaptureProvider())

    state = assistant_module.build_assistant_state(
        "downtown",
        destination_query="India Gate",
        origin=(28.6139, 77.2090),
        trip_urgency=0.75,
    )

    assert captured == ["India Gate, New Delhi"]
    assert state.destination_query == "India Gate"
    assert state.recent_searches[0].destination_query == "India Gate"
    assert state.recent_searches[0].origin == (28.6139, 77.2090)
    assert state.recent_searches[0].trip_urgency == 0.75
    assert state.recent_searches[0].id
    assert state.recent_searches[0].best_lot == state.best_option.lot.name


def test_geocode_failure_falls_back_to_preset_destination(monkeypatch):
    _reset_history()
    captured: list[str] = []

    class CaptureProvider:
        def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
            del mode, preference, refresh
            captured.append(destination)
            lot = ParkingLot(
                id="demo-lot",
                name="Demo Lot",
                address="1 Demo Way",
                position=(28.61, 77.2),
                total_spots=20,
                available_spots=8,
                hourly_rate=10.0,
                walk_minutes=6,
                drive_minutes=4,
                confidence=0.9,
                reservation_supported=True,
            )
            return ParkingSnapshot(
                source_name="Mock feed",
                provider_status="live",
                provider_warning=None,
                last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                freshness_minutes=3,
                lots=[lot],
                live_data_enabled=True,
            )

    monkeypatch.setattr(assistant_module, "geocode_destination", lambda query: (_ for _ in ()).throw(RuntimeError("no geocode")))
    monkeypatch.setattr(assistant_module, "get_provider", lambda: CaptureProvider())

    state = assistant_module.build_assistant_state("downtown", destination_query="Bad Query")

    assert captured == ["Connaught Place, New Delhi"]
    assert state.destination_label == "Connaught Place, New Delhi"
    assert state.destination_query == "Bad Query"


def test_routing_failure_uses_distance_estimate(monkeypatch):
    _reset_history()
    captured: list[str] = []

    class CaptureProvider:
        def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
            del mode, preference, refresh
            captured.append(destination)
            lot = ParkingLot(
                id="demo-lot",
                name="Demo Lot",
                address="1 Demo Way",
                position=(28.61, 77.2),
                total_spots=20,
                available_spots=8,
                hourly_rate=10.0,
                walk_minutes=6,
                drive_minutes=4,
                confidence=0.9,
                reservation_supported=True,
            )
            return ParkingSnapshot(
                source_name="Mock feed",
                provider_status="live",
                provider_warning=None,
                last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                freshness_minutes=3,
                lots=[lot],
                live_data_enabled=True,
            )

    monkeypatch.setattr(assistant_module, "get_provider", lambda: CaptureProvider())
    monkeypatch.setattr(geo_module, "route_metrics", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("route down")))

    state = assistant_module.build_assistant_state("downtown", destination_query="India Gate")

    assert captured == ["India Gate, New Delhi"]
    assert state.route_engine == "ESTIMATE"
    assert all(0.0 <= item.score <= 1.0 for item in state.recommendations)


def test_preset_destination_uses_resolved_label_for_provider(monkeypatch):
    _reset_history()
    captured: list[str] = []

    class CaptureProvider:
        def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
            del mode, preference, refresh
            captured.append(destination)
            lot = ParkingLot(
                id="demo-lot",
                name="Demo Lot",
                address="1 Demo Way",
                position=(28.61, 77.2),
                total_spots=20,
                available_spots=8,
                hourly_rate=10.0,
                walk_minutes=6,
                drive_minutes=4,
                confidence=0.9,
                reservation_supported=True,
            )
            return ParkingSnapshot(
                source_name="Mock feed",
                provider_status="healthy",
                provider_warning=None,
                last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                freshness_minutes=3,
                lots=[lot],
                live_data_enabled=True,
            )

    monkeypatch.setattr(assistant_module, "get_provider", lambda: CaptureProvider())

    assistant_module.build_assistant_state("downtown")

    assert captured == ["Connaught Place, New Delhi"]


def test_degraded_provider_emits_alerts(monkeypatch):
    _reset_history()

    class FailingProvider:
        def snapshot(self, destination: str, mode: str, preference: str, refresh: bool = False) -> ParkingSnapshot:
            del destination, mode, preference, refresh
            lot = ParkingLot(
                id="demo-lot",
                name="Demo Lot",
                address="1 Demo Way",
                position=(40.7138, -74.0065),
                total_spots=20,
                available_spots=2,
                hourly_rate=12.0,
                walk_minutes=8,
                drive_minutes=6,
                confidence=0.62,
                reservation_supported=False,
            )
            return ParkingSnapshot(
                source_name="Mock feed",
                provider_status="degraded",
                provider_warning="Mock feed unavailable; using cached demo data.",
                last_updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                freshness_minutes=18,
                lots=[lot],
                live_data_enabled=True,
            )

    monkeypatch.setattr(assistant_module, "get_provider", lambda: FailingProvider())
    state = assistant_module.build_assistant_state("downtown", trip_urgency=0.85)

    kinds = {alert.id for alert in state.alerts}
    assert state.provider_status == "degraded"
    assert "provider-status" in kinds
    assert "freshness" in kinds
    assert any(alert.severity == "warning" for alert in state.alerts)


def test_recommendation_stability_updates_with_repeated_searches():
    _reset_history()
    first = assistant_module.build_assistant_state("downtown")
    second = assistant_module.build_assistant_state("downtown")

    assert 0.0 <= first.stability_index <= 1.0
    assert 0.0 <= second.stability_index <= 1.0
    assert len(assistant_module._HISTORY) == 2


def test_initial_state_can_skip_history_seed():
    _reset_history()
    state = assistant_module.build_assistant_state("downtown", record_history=False)

    assert len(assistant_module._HISTORY) == 0
    assert state.recent_searches == []
