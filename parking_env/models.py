from __future__ import annotations

from enum import Enum
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    MOVE = "move"
    SCAN = "scan_parking"
    RESERVE = "reserve_spot"
    CANCEL = "cancel_reservation"
    WAIT = "wait"


class Direction(str, Enum):
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"


class Action(BaseModel):
    type: ActionType
    direction: Optional[Direction] = None


class TripPreference(str, Enum):
    BALANCED = "balanced"
    CHEAPEST = "cheapest"
    CLOSEST = "closest"
    RESERVE = "reserve"


class ParkingSpotStatus(str, Enum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    RESERVED = "reserved"


class ParkingSpotInfo(BaseModel):
    position: Tuple[int, int]
    distance: float
    is_available: bool
    status: ParkingSpotStatus


class Observation(BaseModel):
    agent_position: Tuple[int, int]
    nearby_parking: List[ParkingSpotInfo]
    time_elapsed: int
    reservation_status: bool
    current_task: str
    objective: str


class ParkingSpot(BaseModel):
    position: Tuple[int, int]
    status: ParkingSpotStatus
    reserved_by: Optional[str] = None


class TaskDefinition(BaseModel):
    id: str
    title: str
    difficulty: str
    objective: str
    seed: int
    grid_size: int
    max_steps: int
    scan_radius: int
    start_position: Tuple[int, int]
    parking_spots: List[ParkingSpot]
    target_spot: Tuple[int, int]


class EpisodeMetrics(BaseModel):
    total_reward: float = 0.0
    invalid_actions: int = 0
    loop_penalties: int = 0
    scans: int = 0
    reserved_spot: Optional[Tuple[int, int]] = None
    parked_spot: Optional[Tuple[int, int]] = None


class FullState(BaseModel):
    agent_position: Tuple[int, int]
    parking_spots: List[ParkingSpot]
    grid_size: int
    max_steps: int
    steps_elapsed: int
    reservation_status: bool
    reservation_position: Optional[Tuple[int, int]] = None
    is_parked: bool
    current_task: str
    task_title: str
    objective: str
    score: float = Field(ge=0.0, le=1.0)
    metrics: EpisodeMetrics


class ParkingSearchRequest(BaseModel):
    destination: str
    mode: str = "drive"
    destination_query: Optional[str] = None


class ParkingLot(BaseModel):
    id: str
    name: str
    address: str
    position: Tuple[float, float]
    total_spots: int
    available_spots: int
    hourly_rate: float
    walk_minutes: int
    drive_minutes: int
    confidence: float = Field(ge=0.0, le=1.0)
    reservation_supported: bool = False
    map_url: Optional[str] = None
    booking_url: Optional[str] = None


class ParkingRecommendation(BaseModel):
    lot: ParkingLot
    score: float = Field(ge=0.0, le=1.0)
    demand_pressure: float = Field(ge=0.0, le=1.0)
    reason: str
    tradeoff: str
    distance_to_destination: float = Field(ge=0.0)
    distance_from_origin: float = Field(ge=0.0)
    travel_distance: float = Field(ge=0.0)
    estimated_drive_minutes: int = Field(ge=0)
    estimated_total_minutes: int = Field(ge=0)


class AssistantPreset(BaseModel):
    id: str
    label: str
    destination: str
    mode: str
    preference: TripPreference
    urgency: float = Field(ge=0.0, le=1.0)
    description: str


class AssistantSearchRequest(BaseModel):
    destination: str
    mode: str = "drive"
    preference: TripPreference = TripPreference.BALANCED
    trip_urgency: float = Field(default=0.5, ge=0.0, le=1.0)
    origin: Tuple[float, float] | None = None


class AssistantAlert(BaseModel):
    id: str
    severity: str
    title: str
    detail: str


class AssistantHistoryEntry(BaseModel):
    destination: str
    destination_label: str
    mode: str
    preference: TripPreference
    best_lot: Optional[str] = None
    score: float = Field(ge=0.0, le=1.0)
    searched_at: str


class AssistantState(BaseModel):
    destination: str
    destination_label: str
    destination_position: Tuple[float, float]
    destination_source: str
    custom_destination: bool
    travel_mode: str
    preference: TripPreference
    trip_urgency: float = Field(ge=0.0, le=1.0)
    origin: Tuple[float, float]
    total_lots: int
    open_lots: int
    data_source: str
    provider_name: str
    provider_status: str = "healthy"
    provider_warning: Optional[str] = None
    last_updated_at: str
    freshness_minutes: int
    route_engine: str
    route_summary: str
    live_data_enabled: bool
    stability_index: float = Field(ge=0.0, le=1.0)
    alerts: List[AssistantAlert]
    presets: List[AssistantPreset]
    recent_searches: List[AssistantHistoryEntry]
    best_option: Optional[ParkingRecommendation] = None
    recommendations: List[ParkingRecommendation]


class FavoriteTrip(BaseModel):
    id: str
    label: str
    destination: str
    mode: str
    preference: TripPreference
