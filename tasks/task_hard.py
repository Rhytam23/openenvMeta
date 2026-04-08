from __future__ import annotations

from env.core import SmartParkingEnv, TASK_LIBRARY


class TaskHard:
    def __init__(self) -> None:
        self.id = "hard"
        self.definition = TASK_LIBRARY[self.id]
        self.seed = self.definition.seed
        self.env = SmartParkingEnv()
        self.optimal_steps = 7

    def reset(self):
        self.env.configure_task(self.id, self.get_grader())
        return self.env.reset()

    def get_grader(self):
        def grader(env: SmartParkingEnv) -> float:
            if env.metrics.parked_spot != self.definition.target_spot:
                return 0.0
            efficiency = 0.45 * min(1.0, self.optimal_steps / max(self.optimal_steps, env.steps_elapsed or 1))
            discipline = 0.35 * max(0.0, 1.0 - (env.metrics.loop_penalties * 0.2 + env.metrics.invalid_actions * 0.15))
            scan_quality = 0.2 if 1 <= env.metrics.scans <= 2 else 0.05
            return efficiency + discipline + scan_quality

        return grader
