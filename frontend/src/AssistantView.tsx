import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { Activity, CheckCircle2, Clock3, History, MapPin, Sparkles, Shield, Target } from "lucide-react";
import { AssistantState, DestinationOption, formatPos } from "./shared";

const api = axios.create({ baseURL: "/" });

export function AssistantView() {
  const [assistant, setAssistant] = useState<AssistantState | null>(null);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [destination, setDestination] = useState("downtown");
  const [mode, setMode] = useState("drive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function load(silent = false) {
    try {
      const [destRes, stateRes] = await Promise.all([
        api.get<DestinationOption[]>("/assistant/destinations"),
        api.get<AssistantState>("/assistant/state"),
      ]);
      setDestinations(destRes.data);
      setAssistant(stateRes.data);
      if (!silent) {
        setDestination(stateRes.data.destination);
        setMode(stateRes.data.travel_mode);
      }
      setError("");
    } catch {
      if (!silent) setError("Parking assistant unavailable.");
      setDestinations((prev) => prev.length ? prev : [
        { id: "downtown", label: "Downtown Core", position: [40.7128, -74.006] },
        { id: "stadium", label: "Riverfront Stadium", position: [40.729, -73.9965] },
        { id: "hospital", label: "City General Hospital", position: [40.7182, -74.015] },
      ]);
    }
  }

  async function search(refresh = false) {
    setBusy(true);
    try {
      const response = await api.post<AssistantState>(refresh ? "/assistant/refresh" : "/assistant/search", {
        destination,
        mode,
      });
      setAssistant(response.data);
      setError("");
    } catch {
      setError("Could not refresh recommendations.");
    } finally {
      setBusy(false);
    }
  }

  const recommended = assistant?.best_option ?? null;
  const recommendations = assistant?.recommendations ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
      <section className="rounded-[2rem] border border-cyan-400/15 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_35%),linear-gradient(180deg,_rgba(12,18,32,0.98),_rgba(4,9,21,1))] p-5 shadow-[0_0_80px_rgba(6,182,212,0.12)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-cyan-300">
              <Shield className="h-4 w-4" />
              Parking Assistant
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">
              Find parking near {assistant?.destination_label ?? "your destination"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Compare drive time, walk time, price, confidence, and reserve support before you leave.
            </p>
          </div>
          <div className="grid gap-2 sm:min-w-[22rem] sm:grid-cols-2">
            <SelectField label="Destination" value={destination} onChange={setDestination} options={destinations} />
            <SelectChoice
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "drive", label: "Drive" },
                { value: "walk", label: "Walk" },
              ]}
            />
            <button
              className="rounded-2xl border border-cyan-300/30 bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
              onClick={() => void search(false)}
              disabled={busy}
            >
              Search parking
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:opacity-60"
              onClick={() => void search(true)}
              disabled={busy}
            >
              Refresh availability
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Open lots" value={`${assistant?.open_lots ?? "--"}/${assistant?.total_lots ?? "--"}`} accent="text-cyan-300" icon={<MapPin className="h-4 w-4" />} />
          <Metric label="Best score" value={recommended ? recommended.score.toFixed(2) : "--"} accent="text-emerald-300" icon={<Sparkles className="h-4 w-4" />} />
          <Metric label="Mode" value={(assistant?.travel_mode ?? mode).toUpperCase()} accent="text-amber-200" icon={<Clock3 className="h-4 w-4" />} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Recommended Lot" icon={<Target className="h-4 w-4" />}>
            {recommended ? (
              <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-white">{recommended.lot.name}</div>
                    <div className="mt-1 text-sm text-slate-300">{recommended.lot.address}</div>
                  </div>
                  <StatusBadge tone={recommended.lot.reservation_supported ? "success" : "warning"}>
                    {recommended.lot.reservation_supported ? "Reserve" : "Walk-in"}
                  </StatusBadge>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <InfoRow label="Available" value={`${recommended.lot.available_spots}/${recommended.lot.total_spots}`} />
                  <InfoRow label="Rate" value={`$${recommended.lot.hourly_rate.toFixed(2)}/hr`} />
                  <InfoRow label="Drive" value={`${recommended.lot.drive_minutes} min`} />
                  <InfoRow label="Walk" value={`${recommended.lot.walk_minutes} min`} />
                </div>
                <p className="mt-4 text-sm text-cyan-50">{recommended.reason}</p>
                <p className="mt-2 text-sm text-slate-300">{recommended.tradeoff}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                Search for parking to see ranked recommendations.
              </div>
            )}
          </Panel>

          <Panel title="Trip Summary" icon={<History className="h-4 w-4" />}>
            <div className="space-y-3">
              <SummaryLine label="Destination" value={assistant?.destination_label ?? "Downtown Core"} />
              <SummaryLine label="Origin" value={assistant ? formatPos(assistant.origin) : "--"} />
              <SummaryLine label="Open lots" value={assistant ? String(assistant.open_lots) : "--"} />
              <SummaryLine label="Reservation support" value={assistant?.best_option?.lot.reservation_supported ? "Available" : "Varies by lot"} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              This view is designed for drivers, fleets, and front-desk staff who need a practical parking recommendation, not a game state.
            </div>
          </Panel>
        </div>

        <div className="mt-5 rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Ranked lots</p>
              <p className="mt-2 text-sm text-slate-300">Sorted by a practical blend of access, cost, confidence, and reserve support.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {recommendations.map((item) => (
              <div key={item.lot.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold text-white">{item.lot.name}</div>
                      <StatusBadge tone={item.lot.reservation_supported ? "success" : "neutral"}>
                        {item.lot.reservation_supported ? "Reserve" : "Walk-in"}
                      </StatusBadge>
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{item.lot.address}</div>
                    <div className="mt-2 text-sm text-slate-300">{item.reason}</div>
                  </div>
                  <div className="grid min-w-[12rem] grid-cols-2 gap-2 text-sm">
                    <MiniStat label="Score" value={item.score.toFixed(2)} />
                    <MiniStat label="Avail" value={`${item.lot.available_spots}`} />
                    <MiniStat label="Rate" value={`$${item.lot.hourly_rate.toFixed(2)}`} />
                    <MiniStat label="Conf." value={`${Math.round(item.lot.confidence * 100)}%`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && <div className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        </div>
      </section>

      <aside className="space-y-6">
        <Panel title="Why this helps" icon={<Activity className="h-4 w-4" />}>
          <div className="space-y-3 text-sm text-slate-300">
            <Bullet title="Less circling" text="Pick the best lot before you start driving, instead of hunting block by block." />
            <Bullet title="More context" text="See cost, confidence, walking time, and reservation support together." />
            <Bullet title="Operational use" text="A fleet dispatcher, hotel desk, or parking operator can use the same ranking logic." />
          </div>
        </Panel>

        <Panel title="Action suggestions" icon={<CheckCircle2 className="h-4 w-4" />}>
          <div className="grid gap-2 text-sm text-slate-300">
            <Suggestion label="Search before leaving" value="Use the destination selector to compare lots early." />
            <Suggestion label="Reserve when possible" value="Prioritize lots with reservation support during busy times." />
            <Suggestion label="Refresh availability" value="Use refresh when your trip is closer to departure." />
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DestinationOption[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.3em] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectChoice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.3em] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-400">
        {icon}
        {label}
      </div>
      <p className={`mt-3 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
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

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function Bullet({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-300">{text}</div>
    </div>
  );
}

function Suggestion({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-1 text-sm text-slate-300">{value}</div>
    </div>
  );
}
