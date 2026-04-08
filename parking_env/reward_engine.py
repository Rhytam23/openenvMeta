from __future__ import annotations

from typing import Iterable, Optional, Tuple


class RewardEngine:
    def __init__(self) -> None:
        self.reset((0, 0))

    def reset(self, start_pos: Tuple[int, int]) -> None:
        self.visited_positions = {start_pos}
        self.total_reward = 0.0
        self.loop_penalties = 0
        self.invalid_actions = 0
        self.scans = 0

    def calculate_reward(
        self,
        *,
        action_type: str,
        action_valid: bool,
        old_distance: Optional[int],
        new_distance: Optional[int],
        current_pos: Tuple[int, int],
        just_reserved: bool,
        just_parked: bool,
        visible_spots: Iterable[Tuple[int, int]],
    ) -> float:
        reward = -0.2

        if not action_valid:
            self.invalid_actions += 1
            reward -= 2.5
        elif action_type == "move":
            if old_distance is not None and new_distance is not None:
                reward += (old_distance - new_distance) * 0.8
            if current_pos in self.visited_positions:
                self.loop_penalties += 1
                reward -= 0.6
            self.visited_positions.add(current_pos)
        elif action_type == "scan_parking":
            self.scans += 1
            reward += 0.3 if visible_spots else -0.4
            if self.scans > 2:
                reward -= 0.4
        elif action_type == "reserve_spot":
            reward += 1.8 if just_reserved else -1.2
        elif action_type == "cancel_reservation":
            reward -= 0.5
        elif action_type == "wait":
            reward -= 0.4

        if just_parked:
            reward += 6.0

        self.total_reward += reward
        return round(reward, 4)
