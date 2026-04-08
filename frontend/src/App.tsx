import { useEffect, useState } from "react";
import axios from "axios";

type SpotStatus = "available" | "occupied" | "reserved";
type TaskId = "easy" | "medium" | "hard";
type Direction = "up" | "down" | "left" | "right";

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

const api = axios.create({ baseURL: "/" });

function App() {
  const [state, setState] = useState<EnvState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading simulation...");
  const [error, setError] = useState("");
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
    } catch {
      setError("Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  async function step(action: { type: string; direction?: Direction }) {
    if (!state || episodeDone) {
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<{ state: EnvState; info: { reason?: string; score: number } }>("/step", action);
      const nextState = response.data.state;
      setState(nextState);
      setMessage(
        response.data.info.reason === "parked_successfully"
          ? "Success: reserved bay reached."
          : response.data.info.reason === "max_steps_exceeded"
            ? "Episode ended: step budget exhausted."
            : nextState.objective,
      );
      setError("");
    } catch {
      setError("Action failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchState();
    const timer = window.setInterval(() => {
      fetchState(true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const gridSize = state?.grid_size ?? 1;
  const cells = Array.from({ length: gridSize * gridSize }, (_, index) => {
    const x = index % gridSize;
    const y = gridSize - 1 - Math.floor(index / gridSize);
    return { x, y, key: `${x}-${y}` };
  });

  const findSpot = (x: number, y: number) =>
    state?.parking_spots.find((spot) => spot.position[0] === x && spot.position[1] === y) ?? null;

  const taskButtons = state?.available_tasks ?? [
    { id: "easy", title: "Task 1", difficulty: "easy", objective: "" },
    { id: "medium", title: "Task 2", difficulty: "medium", objective: "" },
    { id: "hard", title: "Task 3", difficulty: "hard", objective: "" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <section className="flex-1 rounded-[2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_35%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,1))] p-5 shadow-2xl shadow-cyan-950/40">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">OpenEnv Smart Parking</p>
              <h1 className="mt-2 text-3xl font-bold text-white">{state?.task_title ?? "Smart Parking Control"}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">{message}</p>
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

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/60 p-4">
            <div
              className="mx-auto grid aspect-square w-full max-w-[42rem] gap-2"
              style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
            >
              {cells.map((cell) => {
                const isAgent = state?.agent_position[0] === cell.x && state?.agent_position[1] === cell.y;
                const spot = findSpot(cell.x, cell.y);
                const isTarget =
                  state?.reservation_position?.[0] === cell.x && state?.reservation_position?.[1] === cell.y;
                const spotClass =
                  spot?.status === "available"
                    ? "bg-emerald-400/85"
                    : spot?.status === "reserved"
                      ? "bg-amber-300/90"
                      : spot?.status === "occupied"
                        ? "bg-rose-500/80"
                        : "bg-slate-800";

                return (
                  <div
                    key={cell.key}
                    className={`relative flex aspect-square items-center justify-center rounded-2xl border ${
                      isTarget ? "border-amber-300/70" : "border-white/5"
                    } ${spotClass}`}
                  >
                    {!spot && <div className="h-full w-full rounded-2xl bg-slate-900/70" />}
                    {spot && <span className="text-[10px] font-semibold uppercase text-slate-950">{spot.status}</span>}
                    {isAgent && (
                      <div className="absolute inset-1 flex items-center justify-center rounded-xl border-2 border-white bg-cyan-500 shadow-lg shadow-cyan-500/50">
                        <span className="text-xs font-bold text-slate-950">CAR</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="w-full rounded-[2rem] border border-white/10 bg-slate-900/95 p-5 lg:w-[24rem]">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Score" value={state ? state.score.toFixed(2) : "--"} accent="text-cyan-300" />
            <Metric
              label="Reward"
              value={state ? state.metrics.total_reward.toFixed(2) : "--"}
              accent="text-emerald-300"
            />
              <Metric label="Steps" value={state ? `${state.steps_elapsed}/${state.max_steps}` : "--"} accent="text-white" />
              <Metric label="Scans" value={state ? String(state.metrics.scans) : "--"} accent="text-amber-200" />
            </div>

          <div
            className={`mt-5 rounded-3xl border p-4 text-sm ${
              episodeDone
                ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
                : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Episode</p>
            <p className="mt-2 font-semibold">
              {episodeDone
                ? state?.is_parked
                  ? "Complete: parked successfully."
                  : "Complete: step budget exhausted."
                : "Active"}
            </p>
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Controls</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "up" })}>
                Up
              </ArrowButton>
              <div className="flex gap-2">
                <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "left" })}>
                  Left
                </ArrowButton>
                <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "down" })}>
                  Down
                </ArrowButton>
                <ArrowButton disabled={busy || episodeDone} onClick={() => step({ type: "move", direction: "right" })}>
                  Right
                </ArrowButton>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "scan_parking" })}>
                Scan
              </ActionButton>
              <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "reserve_spot" })}>
                Reserve
              </ActionButton>
              <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "cancel_reservation" })}>
                Cancel
              </ActionButton>
              <ActionButton disabled={busy || episodeDone} onClick={() => step({ type: "wait" })}>
                Wait
              </ActionButton>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Status</p>
            <p className="mt-3">{state?.objective ?? "Preparing deterministic task layout."}</p>
            <p className="mt-2">Reservation: {state?.reservation_position ? state.reservation_position.join(", ") : "none"}</p>
            <p className="mt-2">Loop penalties: {state?.metrics.loop_penalties ?? 0}</p>
            <p className="mt-2">Invalid actions: {state?.metrics.invalid_actions ?? 0}</p>
            {error && <p className="mt-3 rounded-2xl bg-rose-500/10 px-3 py-2 text-rose-200">{error}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className={`mt-3 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function ArrowButton({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="min-w-24 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
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
  children: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-300/50 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default App;
