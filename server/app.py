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


@app.post("/assistant/search")
async def search_assistant(req: AssistantSearchRequest):
    global _assistant_state
    _assistant_state = build_assistant_state(req.destination, req.mode, req.origin, refresh=False, preference=req.preference)
    return _assistant_state.model_dump()


@app.post("/assistant/refresh")
async def refresh_assistant(req: AssistantSearchRequest):
    global _assistant_state
    _assistant_state = build_assistant_state(req.destination, req.mode, req.origin, refresh=True, preference=req.preference)
    return _assistant_state.model_dump()


dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")


def main():
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
