from __future__ import annotations

from typing import Callable, Type

from fastapi import FastAPI
from pydantic import BaseModel


def create_fastapi_app(
    *,
    env_factory: Callable[[], object],
    action_model: Type[BaseModel],
    observation_model: Type[BaseModel],
) -> FastAPI:
    app = FastAPI(title="OpenEnv-compatible server")

    @app.get("/openenv/health")
    async def health():
        env = env_factory()
        return {
            "status": "ok",
            "action_model": action_model.__name__,
            "observation_model": observation_model.__name__,
            "env": env.__class__.__name__,
        }

    return app
