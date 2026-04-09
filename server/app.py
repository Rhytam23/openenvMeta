from __future__ import annotations

import os
import sys
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
from parking_env.assistant import DESTINATIONS, PRESETS, build_assistant_state, get_recent_searches
from parking_env.geo import geocode_destination
from parking_env.core import SmartParkingEnv
from parking_env.models import Action, AssistantSearchRequest, Observation
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
_assistant_state = build_assistant_state("downtown")


class ResetRequest(BaseModel):
    task: str = "easy"


class ReserveRequest(BaseModel):
    lot_id: str


def env_factory():
    return _env_instance


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
        "route_engine": _assistant_state.route_engine,
        "live_data_enabled": _assistant_state.live_data_enabled,
        "destination_source": _assistant_state.destination_source,
    }


@app.post("/assistant/resolve")
async def resolve_destination(req: AssistantSearchRequest):
    query = (req.destination_query or req.destination).strip()
    label, coords, source = geocode_destination(query)
    return {"label": label, "position": coords, "source": source, "custom": True}


@app.post("/assistant/search")
async def search_assistant(req: AssistantSearchRequest):
    global _assistant_state
    _assistant_state = build_assistant_state(
        req.destination,
        req.mode,
        req.origin,
        refresh=False,
        preference=req.preference,
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
        destination_query=req.destination_query,
    )
    return _assistant_state.model_dump()


@app.post("/assistant/reserve")
async def reserve_lot(req: ReserveRequest):
    lot_id = req.lot_id.strip()
    for recommendation in _assistant_state.recommendations:
        if recommendation.lot.id == lot_id:
            if recommendation.lot.booking_url:
                return {"status": "redirect", "url": recommendation.lot.booking_url, "lot": recommendation.lot.model_dump()}
            if recommendation.lot.reservation_supported:
                return {"status": "search", "url": f"https://www.google.com/search?q={recommendation.lot.name}+parking+reservation", "lot": recommendation.lot.model_dump()}
            return {"status": "unavailable", "lot": recommendation.lot.model_dump()}
    raise HTTPException(status_code=404, detail="Lot not found")


dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")


def main():
    port = int(os.environ.get("PORT", "8000"))
    try:
        uvicorn.run(app, host="0.0.0.0", port=port)
    except OSError as exc:
        if getattr(exc, "errno", None) in {98, 10048}:
            return
        raise


if __name__ == "__main__":
    main()
