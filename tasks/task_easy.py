from __future__ import annotations

from parking_env.core import SmartParkingEnv, TASK_LIBRARY


class TaskEasy:
    def __init__(self) -> None:
        self.id = "easy"
        self.definition = TASK_LIBRARY[self.id]
        self.seed = self.definition.seed
        self.env = SmartParkingEnv()
        self.optimal_steps = 4

    def reset(self):
        self.env.configure_task(self.id, self.get_grader())
        return self.env.reset()

    def get_grader(self):
        def grader(env: SmartParkingEnv) -> float:
            if not env.is_parked or env.metrics.parked_spot != self.definition.target_spot:
                return 0.0
            efficiency = self.optimal_steps / max(self.optimal_steps, env.steps_elapsed)
            penalty = min(0.2, env.metrics.invalid_actions * 0.05 + env.metrics.loop_penalties * 0.05)
            return max(0.0, efficiency - penalty)

        return grader
