from __future__ import annotations

import os

import uvicorn
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openenv.core.env_server import create_fastapi_app
from pydantic import BaseModel

from env.core import SmartParkingEnv
from env.models import Action, Observation
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
async def reset_env(req: ResetRequest):
    task_name = req.task if req.task in TASKS else "easy"
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


dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")


def main():
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
