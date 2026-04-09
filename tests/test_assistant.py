from __future__ import annotations

from datetime import datetime, timezone

from parking_env import assistant as assistant_module
from parking_env.models import ParkingLot
from parking_env.providers import ParkingSnapshot


def _reset_history() -> None:
    assistant_module._HISTORY.clear()


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
