export type SpotStatus = "available" | "occupied" | "reserved";
export type TaskId = "easy" | "medium" | "hard";
export type Direction = "up" | "down" | "left" | "right";
export type TripPreference = "balanced" | "cheapest" | "closest" | "reserve";

export interface ParkingSpot {
  position: [number, number];
  status: SpotStatus;
  reserved_by: string | null;
}

export interface Metrics {
  total_reward: number;
  invalid_actions: number;
  loop_penalties: number;
  scans: number;
  reserved_spot: [number, number] | null;
  parked_spot: [number, number] | null;
}

export interface TaskSummary {
  id: TaskId;
  title: string;
  difficulty: string;
  objective: string;
}

export interface EnvState {
  agent_position: [number, number];
  parking_spots: ParkingSpot[];
  grid_size: number;
  max_steps: number;
  steps_elapsed: number;
  reservation_status: boolean;
  reservation_position: [number, number] | null;
  is_parked: boolean;
  current_task: TaskId;
  task_title: string;
  objective: string;
  score: number;
  metrics: Metrics;
  available_tasks: TaskSummary[];
}

export interface DestinationOption {
  id: string;
  label: string;
  position: [number, number];
}

export interface ParkingLot {
  id: string;
  name: string;
  address: string;
  position: [number, number];
  total_spots: number;
  available_spots: number;
  hourly_rate: number;
  walk_minutes: number;
  drive_minutes: number;
  confidence: number;
  reservation_supported: boolean;
}

export interface Recommendation {
  lot: ParkingLot;
  score: number;
  reason: string;
  tradeoff: string;
  distance_to_destination: number;
  estimated_total_minutes: number;
}

export interface AssistantState {
  destination: string;
  destination_label: string;
  destination_position: [number, number];
  travel_mode: string;
  preference: TripPreference;
  origin: [number, number];
  total_lots: number;
  open_lots: number;
  data_source: string;
  last_updated_at: string;
  freshness_minutes: number;
  route_summary: string;
  presets: AssistantPreset[];
  recent_searches: AssistantHistoryEntry[];
  best_option: Recommendation | null;
  recommendations: Recommendation[];
}

export interface AssistantPreset {
  id: string;
  label: string;
  destination: string;
  mode: string;
  preference: TripPreference;
  description: string;
}

export interface AssistantHistoryEntry {
  destination: string;
  destination_label: string;
  mode: string;
  preference: TripPreference;
  best_lot: string | null;
  score: number;
  searched_at: string;
}

export const manhattan = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export const formatPos = (pos?: [number, number] | null) => (pos ? `(${pos[0]}, ${pos[1]})` : "--");
