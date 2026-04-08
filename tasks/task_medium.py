from __future__ import annotations

from env.core import SmartParkingEnv, TASK_LIBRARY


class TaskMedium:
    def __init__(self) -> None:
        self.id = "medium"
        self.definition = TASK_LIBRARY[self.id]
        self.seed = self.definition.seed
        self.env = SmartParkingEnv()
        self.optimal_steps = 6

    def reset(self):
        self.env.configure_task(self.id, self.get_grader())
        return self.env.reset()

    def get_grader(self):
        def grader(env: SmartParkingEnv) -> float:
            reserve_score = 0.35 if env.metrics.reserved_spot == self.definition.target_spot else 0.0
            park_score = 0.45 if env.metrics.parked_spot == self.definition.target_spot else 0.0
            efficiency = 0.2 * min(1.0, self.optimal_steps / max(self.optimal_steps, env.steps_elapsed or 1))
            return reserve_score + park_score + efficiency

        return grader
