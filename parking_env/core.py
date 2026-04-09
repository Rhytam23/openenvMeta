from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable, Dict, List, Optional, Tuple

from .models import (
    Action,
    ActionType,
    EpisodeMetrics,
    FullState,
    Observation,
    ParkingSpot,
    ParkingSpotInfo,
    ParkingSpotStatus,
    TaskDefinition,
)
from .reward_engine import RewardEngine


def _spot(position: Tuple[int, int], status: ParkingSpotStatus) -> ParkingSpot:
    return ParkingSpot(position=position, status=status)


TASK_LIBRARY: Dict[str, TaskDefinition] = {
    "easy": TaskDefinition(
        id="easy",
        title="Task 1: First Open Bay",
        difficulty="easy",
        objective="Reach and reserve the closest open parking bay.",
        seed=11,
        grid_size=6,
        max_steps=18,
        scan_radius=5,
        start_position=(0, 0),
        target_spot=(1, 2),
        parking_spots=[
            _spot((1, 2), ParkingSpotStatus.AVAILABLE),
            _spot((3, 1), ParkingSpotStatus.OCCUPIED),
            _spot((4, 4), ParkingSpotStatus.AVAILABLE),
            _spot((0, 5), ParkingSpotStatus.OCCUPIED),
        ],
    ),
    "medium": TaskDefinition(
        id="medium",
        title="Task 2: Timed Reservation",
        difficulty="medium",
        objective="Scan, reserve a visible bay, and arrive before running out of steps.",
        seed=22,
        grid_size=7,
        max_steps=20,
        scan_radius=3,
        start_position=(0, 6),
        target_spot=(3, 4),
        parking_spots=[
            _spot((1, 5), ParkingSpotStatus.OCCUPIED),
            _spot((3, 4), ParkingSpotStatus.AVAILABLE),
            _spot((5, 5), ParkingSpotStatus.OCCUPIED),
            _spot((6, 1), ParkingSpotStatus.AVAILABLE),
            _spot((2, 1), ParkingSpotStatus.OCCUPIED),
        ],
    ),
    "hard": TaskDefinition(
        id="hard",
        title="Task 3: Congestion Corridor",
        difficulty="hard",
        objective="Avoid wasteful loops, reserve the only optimal bay, and finish with a high score.",
        seed=33,
        grid_size=8,
        max_steps=22,
        scan_radius=3,
        start_position=(7, 0),
        target_spot=(4, 3),
        parking_spots=[
            _spot((6, 2), ParkingSpotStatus.OCCUPIED),
            _spot((5, 1), ParkingSpotStatus.OCCUPIED),
            _spot((4, 3), ParkingSpotStatus.AVAILABLE),
            _spot((2, 6), ParkingSpotStatus.OCCUPIED),
            _spot((0, 7), ParkingSpotStatus.AVAILABLE),
            _spot((7, 4), ParkingSpotStatus.OCCUPIED),
        ],
    ),
}


class SmartParkingEnv:
    SCORE_EPSILON = 0.0001

    def __init__(self, grid_size: int = 6, num_spots: int = 4, max_steps: int = 18):
        self.grid_size = grid_size
        self.num_spots = num_spots
        self.max_steps = max_steps
        self.scan_radius = 5
        self.current_task = "easy"
        self.task_title = TASK_LIBRARY["easy"].title
        self.objective = TASK_LIBRARY["easy"].objective
        self.task_grader: Callable[["SmartParkingEnv"], float] = lambda env: 0.0
        self.reward_engine = RewardEngine()
        self._load_task(TASK_LIBRARY["easy"])

    def available_tasks(self) -> List[Dict[str, str]]:
        return [
            {
                "id": task.id,
                "title": task.title,
                "difficulty": task.difficulty,
                "objective": task.objective,
            }
            for task in TASK_LIBRARY.values()
        ]

    def configure_task(self, task_id: str, grader: Callable[["SmartParkingEnv"], float]) -> None:
        task = TASK_LIBRARY.get(task_id, TASK_LIBRARY["easy"])
        self.task_grader = grader
        self._load_task(task)

    def _load_task(self, task: TaskDefinition) -> None:
        self.current_task = task.id
        self.task_title = task.title
        self.objective = task.objective
        self.grid_size = task.grid_size
        self.max_steps = task.max_steps
        self.scan_radius = task.scan_radius
        self.agent_pos = task.start_position
        self.start_position = task.start_position
        self.target_spot = task.target_spot
        self.parking_spots = {spot.position: deepcopy(spot) for spot in task.parking_spots}
        self.steps_elapsed = 0
        self.reservation = None
        self.is_parked = False
        self.last_info: Dict[str, Any] = {}
        self.reward_engine.reset(self.agent_pos)
        self.metrics = EpisodeMetrics()

    def reset(self, seed: Optional[int] = None, random_start: bool = False) -> Observation:
        del seed, random_start
        task = TASK_LIBRARY[self.current_task]
        self._load_task(task)
        return self._get_observation()

    def _distance(self, a: Tuple[int, int], b: Tuple[int, int]) -> int:
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def _get_visible_spots(self) -> List[ParkingSpotInfo]:
        visible: List[ParkingSpotInfo] = []
        for pos, spot in self.parking_spots.items():
            dist = self._distance(self.agent_pos, pos)
            if dist <= self.scan_radius:
                visible.append(
                    ParkingSpotInfo(
                        position=pos,
                        distance=float(dist),
                        is_available=spot.status == ParkingSpotStatus.AVAILABLE,
                        status=spot.status,
                    )
                )
        visible.sort(key=lambda item: (item.distance, item.position))
        return visible

    def _get_observation(self) -> Observation:
        return Observation(
            agent_position=self.agent_pos,
            nearby_parking=self._get_visible_spots(),
            time_elapsed=self.steps_elapsed,
            reservation_status=self.reservation is not None,
            current_task=self.current_task,
            objective=self.objective,
        )

    def _current_target(self) -> Optional[Tuple[int, int]]:
        if self.reservation is not None:
            return self.reservation
        available = [
            pos
            for pos, spot in self.parking_spots.items()
            if spot.status == ParkingSpotStatus.AVAILABLE
        ]
        if not available:
            return None
        return min(available, key=lambda pos: (self._distance(self.agent_pos, pos), pos))

    def _move(self, direction: Optional[str]) -> bool:
        offsets = {
            "up": (0, 1),
            "down": (0, -1),
            "left": (-1, 0),
            "right": (1, 0),
        }
        if direction not in offsets:
            return False
        dx, dy = offsets[direction]
        nx = self.agent_pos[0] + dx
        ny = self.agent_pos[1] + dy
        if 0 <= nx < self.grid_size and 0 <= ny < self.grid_size:
            self.agent_pos = (nx, ny)
            return True
        return False

    def _reserve(self) -> bool:
        if self.reservation is not None:
            return False
        visible_available = [
            item.position for item in self._get_visible_spots() if item.is_available
        ]
        if not visible_available:
            return False
        target = min(visible_available, key=lambda pos: (self._distance(self.agent_pos, pos), pos))
        spot = self.parking_spots[target]
        spot.status = ParkingSpotStatus.RESERVED
        spot.reserved_by = "agent"
        self.reservation = target
        self.metrics.reserved_spot = target
        return True

    def _cancel(self) -> bool:
        if self.reservation is None:
            return False
        spot = self.parking_spots[self.reservation]
        spot.status = ParkingSpotStatus.AVAILABLE
        spot.reserved_by = None
        self.reservation = None
        self.metrics.reserved_spot = None
        return True

    def _attempt_park(self) -> bool:
        if self.reservation is None or self.agent_pos != self.reservation:
            return False
        self.is_parked = True
        self.metrics.parked_spot = self.agent_pos
        return True

    def step(self, action_dict: Dict[str, Any]) -> Tuple[Observation, float, bool, Dict[str, Any]]:
        action = Action.model_validate(action_dict)
        self.steps_elapsed += 1
        target_before = self._current_target()
        old_distance = self._distance(self.agent_pos, target_before) if target_before else None

        action_valid = True
        just_reserved = False
        just_parked = False
        info: Dict[str, Any] = {"task": self.current_task}

        if action.type == ActionType.MOVE:
            action_valid = self._move(action.direction.value if action.direction else None)
        elif action.type == ActionType.SCAN:
            action_valid = True
        elif action.type == ActionType.RESERVE:
            just_reserved = self._reserve()
            action_valid = just_reserved
        elif action.type == ActionType.CANCEL:
            action_valid = self._cancel()
        elif action.type == ActionType.WAIT:
            action_valid = True

        if action_valid and self._attempt_park():
            just_parked = True
            info["reason"] = "parked_successfully"

        target_after = self._current_target()
        new_distance = self._distance(self.agent_pos, target_after) if target_after else None

        reward = self.reward_engine.calculate_reward(
            action_type=action.type.value,
            action_valid=action_valid,
            old_distance=old_distance,
            new_distance=new_distance,
            current_pos=self.agent_pos,
            just_reserved=just_reserved,
            just_parked=just_parked,
            visible_spots=[item.position for item in self._get_visible_spots()],
        )

        self.metrics.total_reward = round(self.reward_engine.total_reward, 4)
        self.metrics.invalid_actions = self.reward_engine.invalid_actions
        self.metrics.loop_penalties = self.reward_engine.loop_penalties
        self.metrics.scans = self.reward_engine.scans

        done = False
        if self.is_parked:
            done = True
        elif self.steps_elapsed >= self.max_steps:
            done = True
            info["reason"] = "max_steps_exceeded"

        info["score"] = self.grade()
        self.last_info = info
        return self._get_observation(), reward, done, info

    def grade(self) -> float:
        if not self.task_grader:
            return self.SCORE_EPSILON
        score = self.task_grader(self)
        clipped = max(self.SCORE_EPSILON, min(1.0 - self.SCORE_EPSILON, float(score)))
        return round(clipped, 4)

    def state(self) -> Dict[str, Any]:
        state = FullState(
            agent_position=self.agent_pos,
            parking_spots=list(self.parking_spots.values()),
            grid_size=self.grid_size,
            max_steps=self.max_steps,
            steps_elapsed=self.steps_elapsed,
            reservation_status=self.reservation is not None,
            reservation_position=self.reservation,
            is_parked=self.is_parked,
            current_task=self.current_task,
            task_title=self.task_title,
            objective=self.objective,
            score=self.grade(),
            metrics=self.metrics,
        )
        payload = state.model_dump()
        payload["available_tasks"] = self.available_tasks()
        return payload
