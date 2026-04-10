from __future__ import annotations

from math import inf
from typing import Iterable, Optional, Tuple


class RewardEngine:
    def __init__(self, max_ep_reward: float | None = None, min_ep_reward: float | None = None) -> None:
        self.max_ep_reward = inf if max_ep_reward is None else float(max_ep_reward)
        self.min_ep_reward = -inf if min_ep_reward is None else float(min_ep_reward)
        self.reset((0, 0))

    def reset(self, start_pos: Tuple[int, int]) -> None:
        self.visited_positions = {start_pos}
        self._cum_reward = 0.0
        self.loop_penalties = 0
        self.invalid_actions = 0
        self.scans = 0

    @property
    def total_reward(self) -> float:
        return self._cum_reward

    @total_reward.setter
    def total_reward(self, value: float) -> None:
        self._cum_reward = float(value)

    @property
    def cum_reward(self) -> float:
        return self._cum_reward

    @cum_reward.setter
    def cum_reward(self, value: float) -> None:
        self._cum_reward = float(value)

    def calculate_reward(
        self,
        *,
        action_type: str,
        action_valid: bool,
        current_pos: Tuple[int, int],
        old_distance: Optional[int] = None,
        new_distance: Optional[int] = None,
        just_reserved: bool = False,
        just_parked: bool = False,
        visible_spots: Iterable[Tuple[int, int]] = (),
        old_dist_to_spot: Optional[float] = None,
        new_dist_to_spot: Optional[float] = None,
        reserved: Optional[bool] = None,
        time_elapsed: Optional[int] = None,
    ) -> float:
        legacy_mode = (
            old_dist_to_spot is not None
            or new_dist_to_spot is not None
            or reserved is not None
            or time_elapsed is not None
            or self.max_ep_reward != inf
            or self.min_ep_reward != -inf
        )

        if old_distance is None and old_dist_to_spot is not None:
            old_distance = int(old_dist_to_spot)
        if new_distance is None and new_dist_to_spot is not None:
            new_distance = int(new_dist_to_spot)
        if reserved is not None:
            just_reserved = reserved

        reward = 0.0 if legacy_mode else -0.2

        if legacy_mode:
            if action_type == "move":
                if old_distance is not None and new_distance is not None:
                    delta = old_distance - new_distance
                    reward += 1.0 if delta > 0 else -1.0 if delta < 0 else 0.0
                if current_pos in self.visited_positions:
                    self.loop_penalties += 1
                    reward -= 0.5
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

            if not action_valid:
                self.invalid_actions += 1
                reward -= 5.0
            if just_parked:
                reward += 10.0
            reward -= 0.1
        else:
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

        next_total = self.cum_reward + reward
        if legacy_mode and self.max_ep_reward != inf:
            next_total = min(self.max_ep_reward, next_total)
        if legacy_mode and self.min_ep_reward != -inf:
            next_total = max(self.min_ep_reward, next_total)
        reward = next_total - self.cum_reward
        self.cum_reward = next_total
        self.total_reward = next_total
        return round(reward, 4)
