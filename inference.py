from __future__ import annotations

from typing import Dict


def next_move(position: tuple[int, int], target: tuple[int, int]) -> Dict[str, str]:
    px, py = position
    tx, ty = target
    if px < tx:
        return {"type": "move", "direction": "right"}
    if px > tx:
        return {"type": "move", "direction": "left"}
    if py < ty:
        return {"type": "move", "direction": "up"}
    if py > ty:
        return {"type": "move", "direction": "down"}
    return {"type": "wait"}


def solve(task) -> float:
    task.reset()
    env = task.env
    try:
        env.step({"type": "scan_parking"})
        while not env.is_parked and env.steps_elapsed < env.max_steps:
            if env.reservation is None:
                env.step({"type": "reserve_spot"})
                if env.reservation is None:
                    action = next_move(env.agent_pos, task.definition.target_spot)
                    env.step(action)
                    continue
            action = next_move(env.agent_pos, task.definition.target_spot)
            env.step(action)
            if action["type"] == "wait":
                break
        return float(env.grade())
    except Exception:
        return 0.0


def _load_tasks():
    from tasks.task_easy import TaskEasy
    from tasks.task_hard import TaskHard
    from tasks.task_medium import TaskMedium

    return {
        "easy": TaskEasy,
        "medium": TaskMedium,
        "hard": TaskHard,
    }


def main() -> None:
    try:
        tasks = _load_tasks()
        scores = {name: solve(factory()) for name, factory in tasks.items()}
    except Exception:
        scores = {"easy": 0.0, "medium": 0.0, "hard": 0.0}
    for task_name, score in scores.items():
        print(f"{task_name}: {score:.2f}")
    average = sum(scores.values()) / max(1, len(scores))
    print(f"average: {average:.2f}")


if __name__ == "__main__":
    main()
