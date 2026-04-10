from __future__ import annotations

import os
import sys
import socket
from pathlib import Path

import uvicorn
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from openenv.core.env_server import create_fastapi_app
from parking_env.assistant import DESTINATIONS, PRESETS, build_assistant_state, get_recent_searches, _resolve_destination
from parking_env.core import SmartParkingEnv
from parking_env.models import Action, AssistantSearchRequest, Observation
from parking_env.providers import get_provider
from tasks.task_easy import TaskEasy
from tasks.task_hard import TaskHard
from tasks.task_medium import TaskMedium

TASKS = {
    "easy": TaskEasy,
    "medium": TaskMedium,
    "hard": TaskHard,
}

_task_instance = TaskEasy()
_env_instance = _task_instance.env
_task_instance.reset()
_assistant_state = build_assistant_state("downtown", record_history=False)


class ResetRequest(BaseModel):
    task: str = "easy"


class ReserveRequest(BaseModel):
    lot_id: str
    user_data: dict[str, str] | None = None


class NavigateRequest(BaseModel):
    lot_id: str
    travel_mode: str = "drive"


class MetricsResponse(BaseModel):
    provider_name: str
    provider_status: str
    provider_warning: str | None
    freshness_minutes: int
    route_engine: str
    live_data_enabled: bool
    stability_index: float
    alert_count: int
    top_lot: str | None


def env_factory():
    return _env_instance


def _find_recommendation(lot_id: str):
    for recommendation in _assistant_state.recommendations:
        if recommendation.lot.id == lot_id:
            return recommendation
    return None


def _build_navigation_url(lot, travel_mode: str) -> str:
    origin = _assistant_state.origin
    mode = "walking" if travel_mode == "walk" else "driving"
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={origin[0]},{origin[1]}"
        f"&destination={lot.position[0]},{lot.position[1]}"
        f"&travelmode={mode}"
    )


app = create_fastapi_app(
    env_factory=env_factory,
    action_model=Action,
    observation_model=Observation,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/state")
async def get_state():
    return _env_instance.state()


@app.post("/reset")
async def reset_env(req: ResetRequest | None = None):
    task_name = req.task if req and req.task in TASKS else "easy"
    task = TASKS[task_name]()
    global _task_instance, _env_instance
    _task_instance = task
    _env_instance = task.env
    observation = task.reset()
    return {
        "status": "reset",
        "task": task_name,
        "observation": observation.model_dump(),
        "state": _env_instance.state(),
    }


@app.post("/step")
async def post_step(action: Action):
    try:
        observation, reward, done, info = _env_instance.step(action.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "observation": observation.model_dump(),
        "reward": reward,
        "done": done,
        "info": info,
        "state": _env_instance.state(),
    }


@app.get("/assistant/destinations")
async def get_destinations():
    return [
        {"id": key, "label": label, "position": coords}
        for key, (label, coords) in DESTINATIONS.items()
    ]


@app.get("/assistant/state")
async def get_assistant_state():
    return _assistant_state.model_dump()


@app.get("/assistant/presets")
async def get_assistant_presets():
    return [preset.model_dump() for preset in PRESETS]


@app.get("/assistant/history")
async def get_assistant_history():
    return [entry.model_dump() for entry in get_recent_searches()]


@app.get("/assistant/provider")
async def get_assistant_provider():
    return {
        "data_source": _assistant_state.data_source,
        "provider_name": _assistant_state.provider_name,
        "provider_status": _assistant_state.provider_status,
        "provider_warning": _assistant_state.provider_warning,
        "provider_health": _assistant_state.provider_health.model_dump() if _assistant_state.provider_health else None,
        "route_engine": _assistant_state.route_engine,
        "live_data_enabled": _assistant_state.live_data_enabled,
        "destination_source": _assistant_state.destination_source,
        "freshness_minutes": _assistant_state.freshness_minutes,
        "stability_index": _assistant_state.stability_index,
    }


@app.get("/assistant/health")
async def get_assistant_health():
    return {
        "status": _assistant_state.provider_status,
        "warning": _assistant_state.provider_warning,
        "provider_health": _assistant_state.provider_health.model_dump() if _assistant_state.provider_health else None,
        "freshness_minutes": _assistant_state.freshness_minutes,
        "route_engine": _assistant_state.route_engine,
        "live_data_enabled": _assistant_state.live_data_enabled,
        "stability_index": _assistant_state.stability_index,
        "alerts": [alert.model_dump() for alert in _assistant_state.alerts],
    }


@app.get("/assistant/metrics")
async def get_assistant_metrics():
    return MetricsResponse(
        provider_name=_assistant_state.provider_name,
        provider_status=_assistant_state.provider_status,
        provider_warning=_assistant_state.provider_warning,
        freshness_minutes=_assistant_state.freshness_minutes,
        route_engine=_assistant_state.route_engine,
        live_data_enabled=_assistant_state.live_data_enabled,
        stability_index=_assistant_state.stability_index,
        alert_count=len(_assistant_state.alerts),
        top_lot=_assistant_state.best_option.lot.name if _assistant_state.best_option else None,
    ).model_dump()


@app.post("/assistant/resolve")
async def resolve_destination(req: AssistantSearchRequest):
    label, coords, source, custom = _resolve_destination(req.destination, req.destination_query)
    return {
        "label": label,
        "position": coords,
        "source": source,
        "custom": custom,
    }


@app.post("/assistant/search")
async def search_assistant(req: AssistantSearchRequest):
    global _assistant_state
    _assistant_state = build_assistant_state(
        req.destination,
        req.mode,
        req.origin,
        refresh=False,
        preference=req.preference,
        trip_urgency=req.trip_urgency,
        destination_query=req.destination_query,
    )
    return _assistant_state.model_dump()


@app.post("/assistant/refresh")
async def refresh_assistant(req: AssistantSearchRequest):
    global _assistant_state
    _assistant_state = build_assistant_state(
        req.destination,
        req.mode,
        req.origin,
        refresh=True,
        preference=req.preference,
        trip_urgency=req.trip_urgency,
        destination_query=req.destination_query,
    )
    return _assistant_state.model_dump()


@app.post("/assistant/reserve")
async def reserve_lot(req: ReserveRequest):
    return await reserve(req)


@app.post("/reserve")
async def reserve(req: ReserveRequest):
    lot_id = req.lot_id.strip()
    recommendation = _find_recommendation(lot_id)
    if not recommendation:
        raise HTTPException(status_code=404, detail="Lot not found")
    provider = get_provider()
    result = provider.reserve(lot_id, req.user_data or {})
    if result.get("status") == "unavailable" and recommendation.lot.reservation_supported:
        result = {
            "status": "search",
            "url": recommendation.lot.booking_url or f"https://www.google.com/search?q={recommendation.lot.name}+parking+reservation",
            "lot": recommendation.lot.model_dump(),
        }
    if "lot" not in result:
        result["lot"] = recommendation.lot.model_dump()
    return result


@app.post("/assistant/navigate")
async def assistant_navigate(req: NavigateRequest):
    return await navigate(req)


@app.post("/navigate")
async def navigate(req: NavigateRequest):
    lot_id = req.lot_id.strip()
    recommendation = _find_recommendation(lot_id)
    if not recommendation:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot = recommendation.lot
    return {
        "status": "redirect",
        "url": lot.map_url or _build_navigation_url(lot, req.travel_mode),
        "lot": lot.model_dump(),
    }


dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")


def main():
    start_port = int(os.environ.get("PORT", "7860"))
    port = _pick_port(start_port)
    uvicorn.run(app, host="0.0.0.0", port=port)


def _pick_port(start_port: int, attempts: int = 8) -> int:
    for port in range(start_port, start_port + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("0.0.0.0", port))
            except OSError:
                continue
            return port
    return start_port


if __name__ == "__main__":
    main()
