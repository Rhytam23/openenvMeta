import { useEffect, useMemo, useState } from "react";
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
  History,
  Radar,
  RotateCcw,
  Sparkles,
  Shield,
  Target,
  Zap,
} from "lucide-react";
import { Direction, EnvState, SpotStatus, TaskId, formatPos, manhattan } from "./shared";

const api = axios.create({ baseURL: "/" });

export function SimulatorView() {
  const [sim, setSim] = useState<EnvState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Use this mode to train or demo the parking logic.");
  const [error, setError] = useState("");
  const [feed, setFeed] = useState<string[]>([]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function load(silent = false) {
    try {
      const response = await api.get<EnvState>("/state");
      setSim(response.data);
      if (!silent) setMessage(response.data.objective);
      setError("");
    } catch {
      if (!silent) setError("Simulator unavailable.");
    }
  }

  async function reset(task: TaskId) {
    setBusy(true);
    try {
      const response = await api.post<{ state: EnvState }>("/reset", { task });
      setSim(response.data.state);
      setMessage(response.data.state.objective);
      setFeed([`Reset: ${response.data.state.task_title}`]);
      setError("");
    } catch {
      setError("Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  async function step(action: { type: "move" | "scan_parking" | "reserve_spot" | "cancel_reservation" | "wait"; direction?: Direction }, label: string) {
    if (!sim || sim.is_parked || sim.steps_elapsed >= sim.max_steps) return;
    setBusy(true);
    try {
      const response = await api.post<{ state: EnvState; reward: number; done: boolean; info: { reason?: string } }>("/step", action);
      setSim(response.data.state);
      setMessage(
        response.data.info.reason === "parked_successfully"
          ? "Vehicle parked successfully."
          : response.data.info.reason === "max_steps_exceeded"
            ? "Episode ended: step budget exhausted."
            : response.data.state.objective,
      );
      setFeed((prev) => [`${label}: ${response.data.reward.toFixed(2)}`, ...prev].slice(0, 6));
      setError("");
    } catch {
      setError("Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const episodeDone = Boolean(sim && (sim.is_parked || sim.steps_elapsed >= sim.max_steps));
  const progress = sim ? Math.min(100, Math.round((sim.steps_elapsed / sim.max_steps) * 100)) : 0;
  const gridSize = sim?.grid_size ?? 1;
  const cells = useMemo(
    () =>
      Array.from({ length: gridSize * gridSize }, (_, index) => {
        const x = index % gridSize;
        const y = gridSize - 1 - Math.floor(index / gridSize);
        return { x, y, key: `${x}-${y}` };
      }),
    [gridSize],
  );
  const nearbySpots = sim
    ? [...sim.parking_spots]
        .map((spot) => ({ ...spot, distance: manhattan(sim.agent_position, spot.position) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)
    : [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
      <section className="rounded-[2rem] border border-cyan-400/15 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_35%),linear-gradient(180deg,_rgba(12,18,32,0.98),_rgba(4,9,21,1))] p-5 shadow-[0_0_80px_rgba(6,182,212,0.12)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-cyan-300">
              <Shield className="h-4 w-4" />
              Training Simulator
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">
              {sim?.task_title ?? "Smart Parking Control"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{message}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sim?.available_tasks?.map((task) => (
              <button
                key={task.id}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  sim?.current_task === task.id
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
          <Metric label="Score" value={sim ? sim.score.toFixed(2) : "--"} accent="text-cyan-300" icon={<Target className="h-4 w-4" />} />
          <Metric label="Reward" value={sim ? sim.metrics.total_reward.toFixed(2) : "--"} accent="text-emerald-300" icon={<Sparkles className="h-4 w-4" />} />
          <Metric label="Steps" value={sim ? `${sim.steps_elapsed}/${sim.max_steps}` : "--"} accent="text-amber-200" icon={<Clock3 className="h-4 w-4" />} />
        </div>

        <div className="mt-5 rounded-[1.6rem] border border-white/10 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Grid</p>
              <p className="mt-2 text-sm text-slate-300">This is the sandbox mode for training or demos.</p>
            </div>
            <StatusBadge tone={episodeDone ? "success" : "neutral"}>{episodeDone ? "Done" : "Live"}</StatusBadge>
          </div>

          <div
            className="mx-auto mt-4 grid aspect-square w-full max-w-[48rem] gap-2 rounded-[1.6rem] border border-white/5 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.04),_transparent_65%)] p-2 sm:p-3"
            style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
          >
            {cells.map((cell) => {
              const spot = sim?.parking_spots.find((item) => item.position[0] === cell.x && item.position[1] === cell.y);
              const isAgent = sim?.agent_position[0] === cell.x && sim?.agent_position[1] === cell.y;
              const isReservation = sim?.reservation_position?.[0] === cell.x && sim?.reservation_position?.[1] === cell.y;
              return (
                <div
                  key={cell.key}
                  className={`relative flex aspect-square items-center justify-center rounded-2xl border border-white/5 ${cellBaseClass(spot?.status)}`}
                >
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
                    <div className="absolute inset-1 flex items-center justify-center rounded-xl border-2 border-white/70 bg-cyan-400 text-slate-950">
                      <span className="text-xs font-black uppercase tracking-[0.25em]">car</span>
                    </div>
                  )}
                  {!spot && <div className="h-full w-full rounded-2xl bg-slate-900/65" />}
                  {isReservation && !isAgent && <div className="absolute inset-1 rounded-xl border border-amber-200/60" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/95 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Scans" value={sim ? String(sim.metrics.scans) : "--"} accent="text-amber-200" icon={<Radar className="h-4 w-4" />} compact />
            <Metric label="Loops" value={sim ? String(sim.metrics.loop_penalties) : "--"} accent="text-rose-200" icon={<Zap className="h-4 w-4" />} compact />
            <Metric label="Invalid" value={sim ? String(sim.metrics.invalid_actions) : "--"} accent="text-red-200" icon={<Zap className="h-4 w-4" />} compact />
            <Metric label="Progress" value={`${progress}%`} accent="text-cyan-200" icon={<Clock3 className="h-4 w-4" />} compact />
          </div>
          <div className={`mt-4 rounded-3xl border p-4 ${episodeDone ? "border-emerald-300/30 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
              <CheckCircle2 className="h-4 w-4" />
              Episode
            </div>
            <div className="mt-2 text-sm font-semibold">
              {episodeDone ? (sim?.is_parked ? "Parked" : "Step budget exhausted") : "Active"}
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-800">
              <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-900/95 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Actions</p>
              <h2 className="mt-2 text-lg font-bold text-white">Simulator controls</h2>
            </div>
            <RotateCcw className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ActionButton disabled={busy || episodeDone} onClick={() => void step({ type: "scan_parking" }, "Scan")}>Scan</ActionButton>
            <ActionButton disabled={busy || episodeDone} onClick={() => void step({ type: "reserve_spot" }, "Reserve")}>Reserve</ActionButton>
            <ActionButton disabled={busy || episodeDone} onClick={() => void step({ type: "cancel_reservation" }, "Cancel")}>Cancel</ActionButton>
            <ActionButton disabled={busy || episodeDone} onClick={() => void step({ type: "wait" }, "Wait")}>Wait</ActionButton>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ArrowButton disabled={busy || episodeDone} onClick={() => void step({ type: "move", direction: "up" }, "Move up")}><ArrowUp className="h-4 w-4" />Up</ArrowButton>
            <ArrowButton disabled={busy || episodeDone} onClick={() => void step({ type: "move", direction: "down" }, "Move down")}><ArrowDown className="h-4 w-4" />Down</ArrowButton>
            <ArrowButton disabled={busy || episodeDone} onClick={() => void step({ type: "move", direction: "left" }, "Move left")}><ArrowLeft className="h-4 w-4" />Left</ArrowButton>
            <ArrowButton disabled={busy || episodeDone} onClick={() => void step({ type: "move", direction: "right" }, "Move right")}><ArrowRight className="h-4 w-4" />Right</ArrowButton>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-900/95 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
            <History className="h-4 w-4" />
            Nearby spots
          </div>
          <div className="mt-4 space-y-2">
            {nearbySpots.map((spot) => (
              <div key={`${spot.position[0]}-${spot.position[1]}`} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">{formatPos(spot.position)}</div>
                  <div className="text-xs text-slate-400">Distance {spot.distance}</div>
                </div>
                <StatusBadge tone={spot.status === "available" ? "success" : spot.status === "reserved" ? "warning" : "danger"}>{spot.status}</StatusBadge>
              </div>
            ))}
          </div>
          {error && <div className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        </div>
      </aside>
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

function StatusBadge({ children, tone }: { children: ReactNode; tone: "neutral" | "success" | "warning" | "danger" }) {
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

function cellBaseClass(status?: SpotStatus) {
  if (status === "available") return "bg-emerald-400/80";
  if (status === "reserved") return "bg-amber-300/85";
  if (status === "occupied") return "bg-rose-500/80";
  return "bg-slate-900";
}
