import uvicorn
import os
from fastapi import Request, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openenv.core.env_server import create_fastapi_app
from env.core import SmartParkingEnv
from env.models import Action, Observation
from tasks.task_easy import TaskEasy
from tasks.task_medium import TaskMedium
from tasks.task_hard import TaskHard

# Global environment instance for explicit endpoints
_env_instance = SmartParkingEnv()

class ResetRequest(BaseModel):
    task: str = "easy"

def env_factory():
    return _env_instance

# Create the FastAPI app with the environment factory and Pydantic models
app = create_fastapi_app(
    env_factory=env_factory,
    action_model=Action,
    observation_model=Observation
)

@app.get("/state")
async def get_state():
    """Returns the full state of the environment."""
    return _env_instance.state()

@app.post("/reset")
async def reset_env(req: ResetRequest):
    """Resets the environment for a specific task."""
    try:
        if req.task == "easy":
            task = TaskEasy()
        elif req.task == "medium":
            task = TaskMedium()
        elif req.task == "hard":
            task = TaskHard()
        else:
            _env_instance.reset()
            return {"status": "reset", "task": "default"}
            
        # Re-initialize shared env with task parameters if necessary
        # For simplicity, we just reset the global instance for now
        obs = _env_instance.reset(seed=getattr(task, 'seed', None))
        return {"status": "reset", "task": req.task, "observation": obs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/step")
async def post_step(action: Action):
    """Processes a step in the environment."""
    obs, reward, done, info = _env_instance.step(action.model_dump())
    return {
        "observation": obs,
        "reward": reward,
        "done": done,
        "info": info
    }

# Mount static files for the frontend
if os.path.exists("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")

def main():
    """Entry point for the OpenEnv server."""
    uvicorn.run(app, host="0.0.0.0", port=7860)

if __name__ == "__main__":
    main()
