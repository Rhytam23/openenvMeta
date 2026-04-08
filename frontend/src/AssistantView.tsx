import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  History,
  MapPin,
  Navigation,
  Sparkles,
  Shield,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import {
  AssistantHistoryEntry,
  AssistantPreset,
  AssistantState,
  DestinationOption,
  ParkingLot,
  Recommendation,
  TripPreference,
  formatPos,
} from "./shared";

const api = axios.create({ baseURL: "/" });

const preferenceOptions: Array<{ value: TripPreference; label: string }> = [
  { value: "balanced", label: "Balanced" },
  { value: "cheapest", label: "Cheapest" },
  { value: "closest", label: "Closest" },
  { value: "reserve", label: "Reserve-first" },
];

export function AssistantView() {
  const [assistant, setAssistant] = useState<AssistantState | null>(null);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [destination, setDestination] = useState("downtown");
  const [mode, setMode] = useState("drive");
  const [preference, setPreference] = useState<TripPreference>("balanced");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 8000);
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
        setPreference(stateRes.data.preference);
      }
      setError("");
    } catch {
      if (!silent) setError("Parking assistant unavailable.");
      setDestinations((prev) =>
        prev.length
          ? prev
          : [
              { id: "downtown", label: "Downtown Core", position: [40.7128, -74.006] },
              { id: "stadium", label: "Riverfront Stadium", position: [40.729, -73.9965] },
              { id: "hospital", label: "City General Hospital", position: [40.7182, -74.015] },
            ],
      );
    }
  }

  async function search(refresh = false, overrides?: Partial<{ destination: string; mode: string; preference: TripPreference }>) {
    const payload = {
      destination: overrides?.destination ?? destination,
      mode: overrides?.mode ?? mode,
      preference: overrides?.preference ?? preference,
    };
    setBusy(true);
    try {
      const response = await api.post<AssistantState>(refresh ? "/assistant/refresh" : "/assistant/search", payload);
      setAssistant(response.data);
      setDestination(response.data.destination);
      setMode(response.data.travel_mode);
      setPreference(response.data.preference);
      setError("");
    } catch {
      setError("Could not refresh recommendations.");
    } finally {
      setBusy(false);
    }
  }

  const recommended = assistant?.best_option ?? null;
  const recommendations = assistant?.recommendations ?? [];
  const presets = assistant?.presets ?? [];
  const history = assistant?.recent_searches ?? [];

  const selectedDestination = destinations.find((item) => item.id === destination) ?? null;

  const mapPoints = useMemo(() => {
    const lots = recommendations.map((item) => item.lot);
    return buildMapPoints(assistant?.origin, assistant?.destination_position, lots, recommended?.lot ?? null);
  }, [assistant?.destination_position, assistant?.origin, recommendations, recommended?.lot]);

  async function applyPreset(preset: AssistantPreset) {
    setDestination(preset.destination);
    setMode(preset.mode);
    setPreference(preset.preference);
    await search(false, { destination: preset.destination, mode: preset.mode, preference: preset.preference });
  }

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
              Compare route fit, cost, confidence, and reserve support before you leave.
            </p>
          </div>
          <div className="grid gap-2 sm:min-w-[24rem] sm:grid-cols-2">
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
            <SelectChoice
              label="Priority"
              value={preference}
              onChange={(value) => setPreference(value as TripPreference)}
              options={preferenceOptions}
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
            <button
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:opacity-60 sm:col-span-2"
              onClick={() => void search(false, { destination: destination, mode, preference })}
              disabled={busy}
            >
              Re-score current trip
            </button>
          </div>
        </div>

        {presets.length > 0 && (
          <div className="mb-5 rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
              <SlidersHorizontal className="h-4 w-4" />
              Trip presets
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  disabled={busy}
                  onClick={() => void applyPreset(preset)}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  <div className="text-sm font-semibold text-white">{preset.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.25em] text-cyan-200">
                    {preset.destination} | {preset.mode} | {preset.preference}
                  </div>
                  <div className="mt-2 text-sm leading-5 text-slate-300">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Metric label="Open lots" value={`${assistant?.open_lots ?? "--"}/${assistant?.total_lots ?? "--"}`} accent="text-cyan-300" icon={<MapPin className="h-4 w-4" />} />
          <Metric label="Best score" value={recommended ? recommended.score.toFixed(2) : "--"} accent="text-emerald-300" icon={<Sparkles className="h-4 w-4" />} />
          <Metric label="Freshness" value={`${assistant?.freshness_minutes ?? "--"}m`} accent="text-amber-200" icon={<Clock3 className="h-4 w-4" />} />
          <Metric label="Mode" value={(assistant?.travel_mode ?? mode).toUpperCase()} accent="text-blue-200" icon={<Navigation className="h-4 w-4" />} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <Panel title="Route map" icon={<Navigation className="h-4 w-4" />}>
            {assistant ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-3">
                <LotMap
                  points={mapPoints}
                  lots={recommendations.map((item) => item.lot)}
                  bestLot={recommended?.lot ?? null}
                  originLabel={formatPos(assistant.origin)}
                  destinationLabel={assistant.destination_label}
                />
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <InfoBadge label="Origin" value={formatPos(assistant.origin)} />
                  <InfoBadge label="Destination" value={formatPos(assistant.destination_position)} />
                  <InfoBadge label="Strategy" value={assistant.preference} />
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                  Selected area: {selectedDestination?.label ?? assistant.destination_label}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                Search to see the route map and nearby lots.
              </div>
            )}
          </Panel>

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
                  <InfoRow label="Est. total" value={`${recommended.estimated_total_minutes} min`} />
                  <InfoRow label="Dist. to dest" value={recommended.distance_to_destination.toFixed(3)} />
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
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Ranked lots" icon={<ArrowRight className="h-4 w-4" />}>
            <div className="space-y-3">
              {recommendations.map((item, index) => (
                <div key={item.lot.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold text-white">{index + 1}. {item.lot.name}</div>
                        <StatusBadge tone={item.lot.reservation_supported ? "success" : "neutral"}>
                          {item.lot.reservation_supported ? "Reserve" : "Walk-in"}
                        </StatusBadge>
                      </div>
                      <div className="mt-1 text-sm text-slate-400">{item.lot.address}</div>
                      <div className="mt-2 text-sm text-slate-300">{item.reason}</div>
                    </div>
                    <div className="grid min-w-[15rem] grid-cols-2 gap-2 text-sm">
                      <MiniStat label="Score" value={item.score.toFixed(2)} />
                      <MiniStat label="Avail" value={`${item.lot.available_spots}`} />
                      <MiniStat label="Rate" value={`$${item.lot.hourly_rate.toFixed(2)}`} />
                      <MiniStat label="Conf." value={`${Math.round(item.lot.confidence * 100)}%`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel title="Trust signals" icon={<Shield className="h-4 w-4" />}>
              <div className="space-y-3 text-sm text-slate-300">
                <SummaryLine label="Source" value={assistant?.data_source ?? "Demo feed"} />
                <SummaryLine label="Updated" value={assistant?.last_updated_at ? new Date(assistant.last_updated_at).toLocaleString() : "--"} />
                <SummaryLine label="Strategy" value={assistant?.route_summary ?? "Balanced route"} />
                <SummaryLine label="Confidence" value={recommended ? `${Math.round(recommended.lot.confidence * 100)}%` : "--"} />
              </div>
            </Panel>

            <Panel title="Recent searches" icon={<History className="h-4 w-4" />}>
              <div className="space-y-2">
                {history.length > 0 ? (
                  history.map((item) => <HistoryRow key={`${item.searched_at}-${item.destination}-${item.mode}`} item={item} />)
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                    Your last searches will appear here for quick reuse.
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        {error && <div className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      </section>

      <aside className="space-y-6">
        <Panel title="Why this helps" icon={<Activity className="h-4 w-4" />}>
          <div className="space-y-3 text-sm text-slate-300">
            <Bullet title="Less circling" text="Pick the best lot before you start driving, instead of hunting block by block." />
            <Bullet title="More context" text="See cost, confidence, walking time, freshness, and reservation support together." />
            <Bullet title="Operational use" text="A fleet dispatcher, hotel desk, or parking operator can use the same ranking logic." />
          </div>
        </Panel>

        <Panel title="Action suggestions" icon={<CheckCircle2 className="h-4 w-4" />}>
          <div className="grid gap-2 text-sm text-slate-300">
            <Suggestion label="Search before leaving" value="Use a preset to compare lots early." />
            <Suggestion label="Reserve when possible" value="Prioritize lots with reservation support during busy times." />
            <Suggestion label="Refresh availability" value="Use refresh when your trip is closer to departure." />
            <Suggestion label="Tune priority" value="Switch between cheapest, closest, and reserve-first strategies." />
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function buildMapPoints(
  origin: [number, number] | undefined,
  destination: [number, number] | undefined,
  lots: ParkingLot[],
  bestLot: ParkingLot | null,
) {
  const points = [origin, destination, ...lots.map((lot) => lot.position)].filter(Boolean) as Array<[number, number]>;
  if (points.length === 0) return [] as Array<{ x: number; y: number; label: string; type: string; id: string; lot?: ParkingLot }>;
  const lats = points.map((point) => point[0]);
  const lngs = points.map((point) => point[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = Math.max(0.002, (maxLat - minLat) * 0.18);
  const padLng = Math.max(0.002, (maxLng - minLng) * 0.18);
  const width = 1000;
  const height = 560;

  const project = (point: [number, number]) => {
    const x = ((point[1] - (minLng - padLng)) / ((maxLng - minLng) + padLng * 2 || 1)) * width;
    const y = height - ((point[0] - (minLat - padLat)) / ((maxLat - minLat) + padLat * 2 || 1)) * height;
    return { x, y };
  };

  const mapped = [
    origin ? { ...project(origin), label: "You", type: "origin", id: "origin" } : null,
    destination ? { ...project(destination), label: "Destination", type: "destination", id: "destination" } : null,
    ...lots.map((lot) => {
      const isBest = bestLot?.id === lot.id;
      const point = project(lot.position);
      return {
        ...point,
        label: lot.name,
        type: isBest ? "best-lot" : lot.reservation_supported ? "reserve" : "lot",
        id: lot.id,
        lot,
      };
    }),
  ].filter(Boolean);

  return mapped as Array<{ x: number; y: number; label: string; type: string; id: string; lot?: ParkingLot }>;
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

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
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

function HistoryRow({ item }: { item: AssistantHistoryEntry }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{item.destination_label}</div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300">
          {item.preference}
        </span>
      </div>
      <div className="mt-2 text-xs uppercase tracking-[0.28em] text-slate-400">
        {item.mode} | {item.searched_at ? new Date(item.searched_at).toLocaleTimeString() : "--"}
      </div>
      <div className="mt-2 text-sm text-slate-300">
        Best: {item.best_lot ?? "n/a"} | Score {item.score.toFixed(2)}
      </div>
    </div>
  );
}

function LotMap({
  points,
  lots,
  bestLot,
  originLabel,
  destinationLabel,
}: {
  points: Array<{ x: number; y: number; label: string; type: string; id: string; lot?: ParkingLot }>;
  lots: ParkingLot[];
  bestLot: ParkingLot | null;
  originLabel: string;
  destinationLabel: string;
}) {
  const origin = points.find((point) => point.type === "origin");
  const destination = points.find((point) => point.type === "destination");
  const best = points.find((point) => point.type === "best-lot");
  const lotPoints = points.filter((point) => point.lot);

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(12,18,32,0.95),_rgba(7,11,22,0.98))]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">Arrival map</div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Origin to destination parking view</div>
        </div>
        <div className="text-xs text-slate-400">
          {originLabel} {"->"} {destinationLabel}
        </div>
      </div>
      <div className="relative h-[360px] w-full bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.12),_transparent_42%),linear-gradient(135deg,_rgba(8,16,33,0.9),_rgba(10,14,28,1))]">
        <svg viewBox="0 0 1000 560" className="absolute inset-0 h-full w-full">
          {origin && destination && (
            <line x1={origin.x} y1={origin.y} x2={destination.x} y2={destination.y} stroke="rgba(34,211,238,0.55)" strokeWidth="4" strokeDasharray="12 10" />
          )}
          {origin && best && (
            <line x1={origin.x} y1={origin.y} x2={best.x} y2={best.y} stroke="rgba(16,185,129,0.75)" strokeWidth="5" />
          )}
          {lotPoints.map((point) => (
            <g key={point.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.type === "best-lot" ? 20 : point.type === "origin" || point.type === "destination" ? 16 : 14}
                fill={
                  point.type === "origin"
                    ? "rgba(56,189,248,0.95)"
                    : point.type === "destination"
                      ? "rgba(251,191,36,0.95)"
                      : point.type === "best-lot"
                        ? "rgba(16,185,129,0.95)"
                        : point.lot?.reservation_supported
                          ? "rgba(167,139,250,0.88)"
                          : "rgba(244,63,94,0.82)"
                }
                opacity={point.type === "best-lot" ? 1 : 0.9}
              />
              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                fill="#06111f"
                fontSize="20"
                fontWeight="700"
              >
                {point.type === "origin" ? "You" : point.type === "destination" ? "Go" : point.type === "best-lot" ? "Best" : "P"}
              </text>
            </g>
          ))}
        </svg>

        <div className="absolute inset-x-4 bottom-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs text-slate-300">
            <div className="font-semibold text-white">Best lot</div>
            <div className="mt-1">{bestLot ? bestLot.name : "n/a"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs text-slate-300">
            <div className="font-semibold text-white">Available lots</div>
            <div className="mt-1">{lots.filter((lot) => lot.available_spots > 0).length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs text-slate-300">
            <div className="font-semibold text-white">Reservation support</div>
            <div className="mt-1">{lots.filter((lot) => lot.reservation_supported).length} lots</div>
          </div>
        </div>
      </div>
    </div>
  );
}
