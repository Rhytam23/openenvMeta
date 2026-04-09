from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict, List, Optional

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - fallback when the client library is unavailable
    OpenAI = None  # type: ignore[assignment]

try:
    from my_env_v4 import MyEnvV4Action, MyEnvV4Env
except Exception:  # pragma: no cover - benchmark package may not exist locally
    MyEnvV4Action = None  # type: ignore[assignment]
    MyEnvV4Env = None  # type: ignore[assignment]


API_BASE_URL = os.getenv("API_BASE_URL", "https://router.huggingface.co/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen/Qwen2.5-72B-Instruct")
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("API_KEY") or ""
LOCAL_IMAGE_NAME = os.getenv("LOCAL_IMAGE_NAME") or os.getenv("IMAGE_NAME") or ""
BENCHMARK_TASK = os.getenv("MY_ENV_V4_TASK", "echo")
BENCHMARK_NAME = os.getenv("MY_ENV_V4_BENCHMARK", "my_env_v4")
MAX_STEPS = int(os.getenv("MAX_STEPS", "32"))


def log_start(task: str, env: str, model: str) -> None:
    print(f"[START] task={task} env={env} model={model}", flush=True)


def log_step(step: int, action: str, reward: float, done: bool, error: Optional[str]) -> None:
    error_value = error if error else "null"
    print(
        f"[STEP] step={step} action={action} reward={reward:.2f} done={str(done).lower()} error={error_value}",
        flush=True,
    )


def log_end(success: bool, steps: int, score: float, rewards: List[float]) -> None:
    rewards_str = ",".join(f"{reward:.2f}" for reward in rewards)
    print(
        f"[END] success={str(success).lower()} steps={steps} score={score:.2f} rewards={rewards_str}",
        flush=True,
    )


def _load_tasks():
    from tasks.task_easy import TaskEasy
    from tasks.task_hard import TaskHard
    from tasks.task_medium import TaskMedium

    return [
        ("easy", TaskEasy),
        ("medium", TaskMedium),
        ("hard", TaskHard),
    ]


def _action_to_text(action: Dict[str, Any]) -> str:
    return json.dumps(action, separators=(",", ":"), sort_keys=True)


def _close_env(env) -> None:
    close = getattr(env, "close", None)
    if callable(close):
        try:
            close()
        except Exception:
            pass


def _openai_client() -> Optional[OpenAI]:
    if OpenAI is None or not HF_TOKEN:
        return None
    try:
        return OpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)
    except Exception:
        return None


def _extract_visible_available(env) -> List[tuple[int, int]]:
    getter = getattr(env, "_get_visible_spots", None)
    if not callable(getter):
        return []
    visible = []
    for item in getter():
        if getattr(item, "is_available", False):
            visible.append(tuple(item.position))
    return visible


def _heuristic_action(task) -> Dict[str, Any]:
    env = task.env
    target = tuple(task.definition.target_spot)
    visible_available = _extract_visible_available(env)
    if getattr(env, "reservation", None) is None and target in visible_available:
        return {"type": "reserve_spot"}
    if getattr(env, "reservation", None) is not None and env.agent_pos == env.reservation:
        return {"type": "wait"}
    tx, ty = env.reservation or target
    px, py = env.agent_pos
    if px < tx:
        return {"type": "move", "direction": "right"}
    if px > tx:
        return {"type": "move", "direction": "left"}
    if py < ty:
        return {"type": "move", "direction": "up"}
    if py > ty:
        return {"type": "move", "direction": "down"}
    if visible_available:
        return {"type": "reserve_spot"}
    return {"type": "wait"}


def _model_action(client: OpenAI, task_name: str, task) -> Optional[Dict[str, Any]]:
    env = task.env
    prompt = {
        "task": task_name,
        "objective": task.definition.objective,
        "agent_position": env.agent_pos,
        "target_spot": task.definition.target_spot,
        "reservation": getattr(env, "reservation", None),
        "visible_available": _extract_visible_available(env),
        "allowed_actions": [
            {"type": "move", "direction": "up"},
            {"type": "move", "direction": "down"},
            {"type": "move", "direction": "left"},
            {"type": "move", "direction": "right"},
            {"type": "scan_parking"},
            {"type": "reserve_spot"},
            {"type": "cancel_reservation"},
            {"type": "wait"},
        ],
    }
    completion = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": "You control a parking agent. Return only a single JSON object for one valid action.",
            },
            {"role": "user", "content": json.dumps(prompt, separators=(",", ":"))},
        ],
        temperature=0.0,
        max_tokens=80,
    )
    content = (completion.choices[0].message.content or "").strip()
    if not content:
        return None
    if content.startswith("```"):
        content = content.strip("`")
        content = content.split("\n", 1)[-1]
    try:
        action = json.loads(content)
    except Exception:
        return None
    return action if isinstance(action, dict) and isinstance(action.get("type"), str) else None


def choose_action(client: Optional[OpenAI], task_name: str, task) -> Dict[str, Any]:
    if client is not None:
        try:
            action = _model_action(client, task_name, task)
            if isinstance(action, dict):
                return action
        except Exception:
            pass
    return _heuristic_action(task)


def run_local_task(task_name: str, task_factory, client: Optional[OpenAI]) -> None:
    task = task_factory()
    env = task.env
    rewards: List[float] = []
    steps = 0
    score = 0.0
    success = False

    log_start(task=task_name, env="openenv", model=MODEL_NAME)

    try:
        task.reset()
        done = False
        for step in range(1, MAX_STEPS + 1):
            if done:
                break
            action = choose_action(client, task_name, task)
            action_text = _action_to_text(action)
            reward = 0.0
            error: Optional[str] = None
            try:
                _, reward, done, info = env.step(action)
                error = info.get("last_action_error") or info.get("error")
            except Exception as exc:
                done = True
                error = str(exc)
            reward = float(reward or 0.0)
            rewards.append(reward)
            steps = step
            log_step(step=step, action=action_text, reward=reward, done=done, error=error)
            if done:
                break

        score = float(env.grade()) if hasattr(env, "grade") else 0.0
        score = max(0.0, min(1.0, score))
        success = bool(getattr(env, "is_parked", False)) or score >= 0.5
    finally:
        _close_env(env)
        log_end(success=success, steps=steps, score=score, rewards=rewards)


def _benchmark_action(client: Optional[OpenAI], step: int, last_echoed: str, last_reward: float, history: List[str]) -> str:
    if client is not None:
        try:
            completion = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are interacting with a simple echo environment. "
                            "Respond with exactly one message string and nothing else."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Step: {step}\n"
                            f"Last echoed message: {last_echoed!r}\n"
                            f"Last reward: {last_reward:.2f}\n"
                            f"Recent history: {history[-4:]}\n"
                            "Send your next message."
                        ),
                    },
                ],
                temperature=0.7,
                max_tokens=150,
            )
            text = (completion.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception:
            pass
    return "hello"


async def run_benchmark_task(client: Optional[OpenAI]) -> bool:
    if MyEnvV4Env is None or MyEnvV4Action is None:
        return False

    try:
        env = await MyEnvV4Env.from_docker_image(LOCAL_IMAGE_NAME)
    except Exception as exc:
        print(f"[DEBUG] benchmark env startup failed: {exc}", flush=True)
        return False

    history: List[str] = []
    rewards: List[float] = []
    steps_taken = 0
    score = 0.0
    success = False

    log_start(task=BENCHMARK_TASK, env=BENCHMARK_NAME, model=MODEL_NAME)

    try:
        result = await env.reset()
        last_echoed = getattr(result.observation, "echoed_message", "")
        last_reward = 0.0

        for step in range(1, MAX_STEPS + 1):
            if result.done:
                break

            message = _benchmark_action(client, step, last_echoed, last_reward, history)
            try:
                result = await env.step(MyEnvV4Action(message=message))
                obs = result.observation
                reward = float(result.reward or 0.0)
                done = bool(result.done)
                error = getattr(result, "last_action_error", None)
                last_echoed = getattr(obs, "echoed_message", last_echoed)
                last_reward = reward
            except Exception as exc:
                reward = 0.0
                done = True
                error = str(exc)

            rewards.append(reward)
            steps_taken = step
            log_step(step=step, action=message, reward=reward, done=done, error=error)
            history.append(f"Step {step}: {message!r} -> reward {reward:+.2f}")
            if done:
                break

        score = sum(rewards) / max(1.0, float(MAX_STEPS) * 15.0)
        score = max(0.0, min(1.0, score))
        success = score >= 0.1
    finally:
        try:
            await env.close()
        except Exception:
            pass
        log_end(success=success, steps=steps_taken, score=score, rewards=rewards)
    return True


def main() -> None:
    client = _openai_client()
    if MyEnvV4Env is not None and MyEnvV4Action is not None and LOCAL_IMAGE_NAME:
        try:
            if asyncio.run(run_benchmark_task(client)):
                return
        except Exception as exc:
            print(f"[DEBUG] benchmark runner failed: {exc}", flush=True)

    for task_name, task_factory in _load_tasks():
        run_local_task(task_name, task_factory, client)


if __name__ == "__main__":
    main()
