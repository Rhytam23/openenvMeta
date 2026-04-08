import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock3,
  GitBranch,
  History,
  MapPin,
  Radar,
  RotateCcw,
  Sparkles,
  Shield,
  Target,
  Zap,
} from "lucide-react";

type SpotStatus = "available" | "occupied" | "reserved";
type TaskId = "easy" | "medium" | "hard";
type Direction = "up" | "down" | "left" | "right";
type ActionType = "move" | "scan_parking" | "reserve_spot" | "cancel_reservation" | "wait";

interface ParkingSpot {
  position: [number, number];
  status: SpotStatus;
  reserved_by: string | null;
}

interface Metrics {
  total_reward: number;
  invalid_actions: number;
  loop_penalties: number;
  scans: number;
  reserved_spot: [number, number] | null;
  parked_spot: [number, number] | null;
}

interface TaskSummary {
  id: TaskId;
  title: string;
  difficulty: string;
  objective: string;
}

interface EnvState {
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

interface FeedItem {
  id: number;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

const api = axios.create({ baseURL: "/" });

function App() {
  const [state, setState] = useState<EnvState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading simulation...");
  const [error, setError] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const episodeDone = Boolean(state && (state.is_parked || state.steps_elapsed >= state.max_steps));

  async function fetchState(silent = false) {
    try {
      const response = await api.get<EnvState>("/state");
      setState(response.data);
      if (!silent) {
        setMessage(
          response.data.is_parked
            ? "Vehicle parked successfully."
            : response.data.steps_elapsed >= response.data.max_steps
              ? "Episode complete: step budget exhausted."
              : response.data.objective,
        );
      }
      setError("");
    } catch {
      setError("Backend unavailable.");
      if (!silent) {
        setMessage("Waiting for the API.");
      }
    }
  }

  async function reset(task: TaskId) {
    setBusy(true);
    try {
      const response = await api.post<{ state: EnvState }>("/reset", { task });
      setState(response.data.state);
      setMessage(response.data.state.objective);
      setError("");
      setFeed([
        {
          id: Date.now(),
          title: "Task reset",
          detail: `Loaded ${response.data.state.task_title}.`,
          tone: "neutral",
        },
      ]);
    } catch {
      setError("Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  async function step(action: { type: ActionType; direction?: Direction }, label: string) {
    if (!state || episodeDone) {
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<{ state: EnvState; reward: number; done: boolean; info: { reason?: string } }>(
        "/step",
        action,
      );
      const nextState = response.data.state;
      setState(nextState);
      const reason = response.data.info.reason;
      setMessage(
        reason === "parked_successfully"
          ? "Success: reserved bay reached."
          : reason === "max_steps_exceeded"
            ? "Episode ended: step budget exhausted."
            : nextState.objective,
      );
      setFeed((prev) =>
        [
          {
            id: Date.now(),
            title: label,
            detail: reason
              ? `${label} | ${reason.replace(/_/g, " ")}`
              : `${label} | reward ${response.data.reward.toFixed(2)}`,
            tone: (reason === "parked_successfully"
              ? "success"
              : reason === "max_steps_exceeded"
                ? "warning"
                : "neutral") as FeedItem["tone"],
          },
          ...prev,
        ].slice(0, 6),
      );
      setError("");
    } catch {
      setError("Action failed.");
      setFeed((prev) =>
        [
          {
            id: Date.now(),
            title: "Action failed",
            detail: label,
            tone: "danger" as const,
          },
          ...prev,
        ].slice(0, 6),
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchState();
    const timer = window.setInterval(() => {
      fetchState(true);
    }, 2500);

    const onKeyDown = (event: KeyboardEvent) => {
      if (busy) return;
      const key = event.key.toLowerCase();
      if (key === "arrowup" || key === "w") return step({ type: "move", direction: "up" }, "Move up");
      if (key === "arrowdown" || key === "s") return step({ type: "move", direction: "down" }, "Move down");
      if (key === "arrowleft" || key === "a") return step({ type: "move", direction: "left" }, "Move left");
      if (key === "arrowright" || key === "d") return step({ type: "move", direction: "right" }, "Move right");
      if (key === " ") {
        event.preventDefault();
        return step({ type: "scan_parking" }, "Scan");
      }
      if (key === "r") return step({ type: "reserve_spot" }, "Reserve");
      if (key === "c") return step({ type: "cancel_reservation" }, "Cancel");
      if (key === "enter") return step({ type: "wait" }, "Wait");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, episodeDone, state]);

  const gridSize = state?.grid_size ?? 1;
  const cells = Array.from({ length: gridSize * gridSize }, (_, index) => {
    const x = index % gridSize;
    const y = gridSize - 1 - Math.floor(index / gridSize);
    return { x, y, key: `${x}-${y}` };
  });

  const taskButtons = state?.available_tasks ?? [
    { id: "easy", title: "Task 1", difficulty: "easy", objective: "" },
    { id: "medium", title: "Task 2", difficulty: "medium", objective: "" },
    { id: "hard", title: "Task 3", difficulty: "hard", objective: "" },
  ];

  const suggested = suggestNextAction(state);
  const progress = state ? Math.min(100, Math.round((state.steps_elapsed / state.max_steps) * 100)) : 0;
  const nearby = state
    ? [...state.parking_spots]
        .map((spot) => ({
          ...spot,
          distance: manhattan(state.agent_position, spot.position),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)
    : [];

  return (
    <div className="min-h-screen bg-[#050816] text-slate-100">
      <div className="mx-auto min-h-screen max-w-[1600px] px-4 py-4 lg:px-6 lg:py-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_420px]">
          <section className="rounded-[2rem] border border-cyan-400/15 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_35%),linear-gradient(180deg,_rgba(12,18,32,0.98),_rgba(4,9,21,1))] p-5 shadow-[0_0_80px_rgba(6,182,212,0.12)]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-cyan-300">
                    <Shield className="h-4 w-4" />
                    OpenEnv Smart Parking
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">
                        {state?.task_title ?? "Smart Parking Control"}
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{message}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <StatusPill tone={episodeDone ? "success" : "neutral"}>
                        {episodeDone ? (state?.is_parked ? "Parked" : "Episode done") : busy ? "Busy" : "Active"}
                      </StatusPill>
                      <StatusPill tone="neutral">{state ? `${state.steps_elapsed}/${state.max_steps} steps` : "--"}</StatusPill>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {taskButtons.map((task) => (
                    <button
                      key={task.id}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        state?.current_task === task.id
                          ? "border-cyan-300 bg-cyan-400 text-slate-950"
                          : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-300/50 hover:bg-cyan-400/10"
                      }`}
                      disabled={busy}
                      onClick={() => reset(task.id)}
                    >
                      {task.difficulty}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Metric label="Score" value={state ? state.score.toFixed(2) : "--"} accent="text-cyan-300" icon={<Target className="h-4 w-4" />} />
                <Metric label="Reward" value={state ? state.metrics.total_reward.toFixed(2) : "--"} accent="text-emerald-300" icon={<Sparkles className="h-4 w-4" />} />
                <Metric
                  label="Efficiency"
                  value={state ? `${100 - progress}%` : "--"}
                  accent="text-amber-200"
                  icon={<Clock3 className="h-4 w-4" />}
                />
              </div>

              <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Parking Grid</p>
                    <p className="mt-2 text-sm text-slate-300">
                      Use arrow keys or WASD. `Space` scans, `R` reserves, `C` cancels, `Enter` waits.
                    </p>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    available
                    <span className="ml-2 h-2 w-2 rounded-full bg-rose-400" />
                    occupied
                    <span className="ml-2 h-2 w-2 rounded-full bg-amber-300" />
                    reserved
                  </div>
                </div>

                <div
                  className="mx-auto grid aspect-square w-full max-w-[48rem] gap-2 rounded-[1.6rem] border border-white/5 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.04),_transparent_65%)] p-2 sm:p-3"
                  style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
                >
                  {cells.map((cell) => {
                    const spot = state?.parking_spots.find(
                      (item) => item.position[0] === cell.x && item.position[1] === cell.y,
                    );
                    const isAgent = state?.agent_position[0] === cell.x && state?.agent_position[1] === cell.y;
                    const isReservation =
                      state?.reservation_position?.[0] === cell.x && state?.reservation_position?.[1] === cell.y;
                    const isSuggested = suggested?.target?.[0] === cell.x && suggested?.target?.[1] === cell.y;

                    return (
                      <div
                        key={cell.key}
                        className={`relative flex aspect-square items-center justify-center rounded-2xl border transition ${
                          isSuggested ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]" : "border-white/5"
                        } ${cellBaseClass(spot?.status)}`}
                      >
                        <span className="absolute left-2 top-2 text-[10px] font-medium text-white/30">
                          {cell.x},{cell.y}
                        </span>
                        {spot && (
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                              spot.status === "available"
                                ? "bg-emerald-300/90 text-emerald-950"
                                : spot.status === "reserved"
                                  ? "bg-amber-300/90 text-amber-950"
                                  : "bg-rose-400/90 text-rose-950"
                            }`}
                          >
                            {spot.status}
                          </span>
                        )}
                        {isAgent && (
                          <div className="absolute inset-1 flex items-center justify-center rounded-xl border-2 border-white/70 bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.55)]">
                            <span className="text-xs font-black uppercase tracking-[0.25em]">car</span>
                          </div>
                        )}
                        {!spot && <div className="h-full w-full rounded-2xl bg-slate-900/65" />}
                        {isReservation && !isAgent && (
                          <div className="absolute inset-1 rounded-xl border border-amber-200/60" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Nearby / Known Spots" icon={<MapPin className="h-4 w-4" />}>
                  <div className="space-y-2">
                    {nearby.map((spot) => (
                      <div
                        key={`${spot.position[0]}-${spot.position[1]}`}
                        className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">Spot {formatPos(spot.position)}</div>
                          <div className="text-xs text-slate-400">Distance {spot.distance}</div>
                        </div>
                        <StatusPill tone={spot.status === "available" ? "success" : spot.status === "reserved" ? "warning" : "danger"}>
                          {spot.status}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Activity Log" icon={<History className="h-4 w-4" />}>
                  <div className="space-y-2">
                    {feed.length ? (
                      feed.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-2xl border px-4 py-3 ${
                            item.tone === "success"
                              ? "border-emerald-300/20 bg-emerald-500/10"
                              : item.tone === "warning"
                                ? "border-amber-300/20 bg-amber-500/10"
                                : item.tone === "danger"
                                  ? "border-rose-300/20 bg-rose-500/10"
                                  : "border-white/8 bg-white/5"
                          }`}
                        >
                          <div className="text-sm font-semibold text-white">{item.title}</div>
                          <div className="text-xs text-slate-300">{item.detail}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                        Action history will appear here as you run the simulation.
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/95 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Steps" value={state ? `${state.steps_elapsed}/${state.max_steps}` : "--"} accent="text-white" icon={<Clock3 className="h-4 w-4" />} compact />
                <Metric label="Scans" value={state ? String(state.metrics.scans) : "--"} accent="text-amber-200" icon={<Radar className="h-4 w-4" />} compact />
                <Metric label="Loops" value={state ? String(state.metrics.loop_penalties) : "--"} accent="text-rose-200" icon={<GitBranch className="h-4 w-4" />} compact />
                <Metric label="Invalid" value={state ? String(state.metrics.invalid_actions) : "--"} accent="text-red-200" icon={<Zap className="h-4 w-4" />} compact />
              </div>

              <div className={`mt-4 rounded-3xl border p-4 ${episodeDone ? "border-emerald-300/30 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Episode
                </div>
                <div className="mt-2 text-sm font-semibold">
                  {episodeDone
                    ? state?.is_parked
                      ? "Complete: parked successfully."
                      : "Complete: step budget exhausted."
                    : "Active"}
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Coach</p>
                    <h2 className="mt-2 text-lg font-bold text-white">Next Best Move</h2>
                  </div>
                  <Sparkles className="h-5 w-5 text-cyan-300" />
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                  <div className="text-sm font-semibold text-cyan-100">{suggested.title}</div>
                  <div className="mt-1 text-sm text-slate-300">{suggested.reason}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <StatusPill tone="neutral">{suggested.actionLabel}</StatusPill>
                    <StatusPill tone={suggested.priority === "high" ? "success" : "neutral"}>{suggested.targetLabel}</StatusPill>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "scan_parking" }, "Scan")}>
                    Scan
                  </ActionButton>
                  <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "reserve_spot" }, "Reserve")}>
                    Reserve
                  </ActionButton>
                  <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "cancel_reservation" }, "Cancel")}>
                    Cancel
                  </ActionButton>
                  <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "wait" }, "Wait")}>
                    Wait
                  </ActionButton>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "up" }, "Move up")}>
                    <ArrowUp className="h-4 w-4" /> Up
                  </ArrowButton>
                  <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "down" }, "Move down")}>
                    <ArrowDown className="h-4 w-4" /> Down
                  </ArrowButton>
                  <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "left" }, "Move left")}>
                    <ArrowLeft className="h-4 w-4" /> Left
                  </ArrowButton>
                  <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "right" }, "Move right")}>
                    <ArrowRight className="h-4 w-4" /> Right
                  </ArrowButton>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-900/95 p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
                <Activity className="h-4 w-4" />
                Shortcuts
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <Shortcut keyLabel="W / Up" label="Move up" />
                <Shortcut keyLabel="A / Left" label="Move left" />
                <Shortcut keyLabel="S / Down" label="Move down" />
                <Shortcut keyLabel="D / Right" label="Move right" />
                <Shortcut keyLabel="Space" label="Scan for spots" />
                <Shortcut keyLabel="R" label="Reserve visible spot" />
                <Shortcut keyLabel="C" label="Cancel reservation" />
                <Shortcut keyLabel="Enter" label="Wait" />
              </div>
              {error && <div className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function suggestNextAction(state: EnvState | null) {
  if (!state) {
    return {
      title: "Load a task to begin.",
      reason: "Pick a difficulty and the coach will map the shortest useful move.",
      actionLabel: "Waiting",
      targetLabel: "No task",
      target: null as [number, number] | null,
      priority: "low" as const,
    };
  }

  if (state.is_parked) {
    return {
      title: "Mission complete.",
      reason: "The car is parked. Reset to try a different route or task.",
      actionLabel: "Reset",
      targetLabel: formatPos(state.reservation_position ?? state.agent_position),
      target: state.agent_position,
      priority: "high" as const,
    };
  }

  const visibleAvailable = state.parking_spots
    .filter((spot) => spot.status !== "occupied")
    .map((spot) => ({
      ...spot,
      distance: manhattan(state.agent_position, spot.position),
    }))
    .sort((a, b) => a.distance - b.distance);

  const reservation = state.reservation_position
    ? state.parking_spots.find(
        (spot) => spot.position[0] === state.reservation_position?.[0] && spot.position[1] === state.reservation_position?.[1],
      ) ?? null
    : null;

  if (reservation) {
    const d = manhattan(state.agent_position, reservation.position);
    const direction = directionToward(state.agent_position, reservation.position);
    return {
      title: d === 0 ? "You are on the reserved bay." : "Head back to the reserved spot.",
      reason:
        d === 0
          ? "Any next valid action should complete the park automatically."
          : `Move ${direction} until you reach ${formatPos(reservation.position)}.`,
      actionLabel: d === 0 ? "Any valid action" : `Move ${direction}`,
      targetLabel: `Reserved ${formatPos(reservation.position)}`,
      target: reservation.position,
      priority: "high" as const,
    };
  }

  const target = visibleAvailable[0];
  if (!target) {
    return {
      title: "No open spots visible yet.",
      reason: "Move toward the nearest known open bay, then scan once you are closer.",
      actionLabel: "Move",
      targetLabel: "Search",
      target: null,
      priority: "low" as const,
    };
  }

  if (target.distance <= 3) {
    return {
      title: "Visible open bay found.",
      reason: `Reserve the open spot at ${formatPos(target.position)} before others take it.`,
      actionLabel: "Reserve spot",
      targetLabel: formatPos(target.position),
      target: target.position,
      priority: "high" as const,
    };
  }

  const direction = directionToward(state.agent_position, target.position);
  return {
    title: "Close the distance first.",
    reason: `Move ${direction} toward ${formatPos(target.position)}. Once it is visible, reserve immediately.`,
    actionLabel: `Move ${direction}`,
    targetLabel: formatPos(target.position),
    target: target.position,
    priority: "low" as const,
  };
}

function directionToward(from: [number, number], to: [number, number]): Direction {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "up" : "down";
}

function manhattan(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function formatPos(pos: [number, number] | null) {
  if (!pos) return "--";
  return `(${pos[0]}, ${pos[1]})`;
}

function cellBaseClass(status?: SpotStatus) {
  if (status === "available") return "bg-emerald-400/80";
  if (status === "reserved") return "bg-amber-300/85";
  if (status === "occupied") return "bg-rose-500/80";
  return "bg-slate-900";
}

function Metric({
  label,
  value,
  accent,
  icon,
  compact = false,
}: {
  label: string;
  value: string;
  accent: string;
  icon: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/5 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-400">
        {icon}
        {label}
      </div>
      <p className={`mt-3 ${compact ? "text-xl" : "text-2xl"} font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "neutral" | "success" | "warning" | "danger" }) {
  const cls =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
          : "border-white/10 bg-white/5 text-slate-200";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
        {icon}
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ArrowButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Shortcut({ keyLabel, label }: { keyLabel: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-200">{keyLabel}</span>
      <span className="text-sm text-slate-300">{label}</span>
    </div>
  );
}

export default App;
