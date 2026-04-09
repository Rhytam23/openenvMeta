import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
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
  FavoriteTrip,
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
  const [destinationQuery, setDestinationQuery] = useState("");
  const [mode, setMode] = useState("drive");
  const [preference, setPreference] = useState<TripPreference>("balanced");
  const [originOverride, setOriginOverride] = useState<[number, number] | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [filters, setFilters] = useState({
    maxPrice: "",
    maxWalk: "",
    minConfidence: "0.65",
    minAvailability: "1",
    reservableOnly: false,
  });
  const [favorites, setFavorites] = useState<FavoriteTrip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const favoriteStorageKey = "openenv.parking.favorites.v1";

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(favoriteStorageKey);
      if (raw) {
        setFavorites(JSON.parse(raw) as FavoriteTrip[]);
      }
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favorites));
    } catch {
      // ignore storage failures
    }
  }, [favorites]);

  async function load(silent = false) {
    try {
      const [destRes, stateRes] = await Promise.all([
        api.get<DestinationOption[]>("/assistant/destinations"),
        api.get<AssistantState>("/assistant/state"),
      ]);
      setDestinations(destRes.data);
      setAssistant(stateRes.data);
      syncSelectedLot(stateRes.data);
      if (!silent) {
        setDestination(stateRes.data.destination);
        setDestinationQuery("");
        setMode(stateRes.data.travel_mode);
        setPreference(stateRes.data.preference);
        if (!originOverride) setOriginOverride(stateRes.data.origin);
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
    const origin = originOverride ?? assistant?.origin ?? undefined;
    const payload = {
      destination: overrides?.destination ?? destination,
      destination_query: destinationQuery.trim() || null,
      mode: overrides?.mode ?? mode,
      preference: overrides?.preference ?? preference,
      origin,
    };
    setBusy(true);
    try {
      const response = await api.post<AssistantState>(refresh ? "/assistant/refresh" : "/assistant/search", payload);
      setAssistant(response.data);
      syncSelectedLot(response.data);
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
  const currentOrigin = originOverride ?? assistant?.origin ?? null;
  const selectedDestination = destinations.find((item) => item.id === destination) ?? null;
  const filteredRecommendations = useMemo(() => {
    if (!recommendations.length) return [];
    const maxPrice = filters.maxPrice.trim() ? Number(filters.maxPrice) : Number.POSITIVE_INFINITY;
    const maxWalk = filters.maxWalk.trim() ? Number(filters.maxWalk) : Number.POSITIVE_INFINITY;
    const minConfidence = Number(filters.minConfidence || "0");
    const minAvailability = filters.minAvailability.trim() ? Number(filters.minAvailability) : 0;
    return recommendations.filter((item) => {
      if (filters.reservableOnly && !item.lot.reservation_supported) return false;
      if (item.lot.hourly_rate > maxPrice) return false;
      if (item.lot.walk_minutes > maxWalk) return false;
      if (item.lot.confidence < minConfidence) return false;
      if (item.lot.available_spots < minAvailability) return false;
      return true;
    });
  }, [recommendations, filters]);
  const visibleRecommendations = filteredRecommendations.length ? filteredRecommendations : recommendations;
  const selectedLot = selectedLotId ? visibleRecommendations.find((item) => item.lot.id === selectedLotId)?.lot ?? null : null;
  const topPicks = visibleRecommendations.slice(0, 3);
  const primaryRecommendation = visibleRecommendations[0] ?? null;

  function syncSelectedLot(nextState: AssistantState) {
    setSelectedLotId((current) => {
      if (current && nextState.recommendations.some((item) => item.lot.id === current)) {
        return current;
      }
      return nextState.best_option?.lot.id ?? nextState.recommendations[0]?.lot.id ?? null;
    });
  }

  useEffect(() => {
    if (!selectedLotId) return;
    if (visibleRecommendations.some((item) => item.lot.id === selectedLotId)) return;
    setSelectedLotId(visibleRecommendations[0]?.lot.id ?? null);
  }, [selectedLotId, visibleRecommendations]);

  function handleDestinationChange(nextDestination: string) {
    setDestination(nextDestination);
    setDestinationQuery("");
    setSelectedLotId(null);
    void search(false, { destination: nextDestination, mode, preference });
  }

  async function applyPreset(preset: AssistantPreset) {
    setDestination(preset.destination);
    setDestinationQuery("");
    setMode(preset.mode);
    setPreference(preset.preference);
    await search(false, { destination: preset.destination, mode: preset.mode, preference: preset.preference });
  }

  function openDirectionsTo(target: [number, number], travelMode: string = mode) {
    const origin = originOverride ?? assistant?.origin;
    if (!origin) return;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin[0]},${origin[1]}`)}&destination=${encodeURIComponent(`${target[0]},${target[1]}`)}&travelmode=${travelMode === "walk" ? "walking" : "driving"}`;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  }

  function openLotDirections(lot: ParkingLot) {
    if (lot.map_url) {
      window.open(lot.map_url, "_blank", "noopener,noreferrer");
      return;
    }
    openDirectionsTo(lot.position);
  }

  function openLotReservation(lot: ParkingLot) {
    if (lot.booking_url) {
      window.open(lot.booking_url, "_blank", "noopener,noreferrer");
      return;
    }
    const query = encodeURIComponent(`${lot.name} parking reservation`);
    window.open(`https://www.google.com/search?q=${query}`, "_blank", "noopener,noreferrer");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Your browser does not support location sharing.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOriginOverride([position.coords.latitude, position.coords.longitude]);
        setError("");
        setBusy(false);
      },
      () => {
        setError("Location access was denied.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    );
  }

  function saveFavorite() {
    const next: FavoriteTrip = {
      id: `${destination}-${mode}-${preference}`,
      label: selectedDestination?.label ?? destination,
      destination,
      mode,
      preference,
    };
    setFavorites((prev) => {
      const filtered = prev.filter((item) => item.id !== next.id);
      return [next, ...filtered].slice(0, 8);
    });
  }

  async function applyFavorite(item: FavoriteTrip) {
    setDestination(item.destination);
    setDestinationQuery("");
    setMode(item.mode);
    setPreference(item.preference);
    await search(false, { destination: item.destination, mode: item.mode, preference: item.preference });
  }

  function rerunHistory(item: AssistantHistoryEntry) {
    setDestination(item.destination);
    setDestinationQuery("");
    setMode(item.mode);
    setPreference(item.preference);
    setSelectedLotId(null);
    void search(false, { destination: item.destination, mode: item.mode, preference: item.preference });
  }

  function clearFilters() {
    setFilters({
      maxPrice: "",
      maxWalk: "",
      minConfidence: "0.65",
      minAvailability: "1",
      reservableOnly: false,
    });
  }

  return (
    <div className="grid gap-6 pb-36 xl:grid-cols-[minmax(0,1.45fr)_420px]">
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
            <SelectField label="Destination" value={destination} onChange={handleDestinationChange} options={destinations} />
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.3em] text-slate-400">Search place</span>
              <input
                value={destinationQuery}
                onChange={(event) => setDestinationQuery(event.target.value)}
                placeholder="Type any address, venue, or landmark"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              />
            </label>
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
            <button
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:opacity-60"
              onClick={useCurrentLocation}
              disabled={busy}
            >
              Use my location
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:opacity-60"
              onClick={saveFavorite}
              disabled={busy}
            >
              Save favorite
            </button>
          </div>
        </div>

        {favorites.length > 0 && (
          <div className="mb-5 rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-400">
              <MapPin className="h-4 w-4" />
              Favorites
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {favorites.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  onClick={() => void applyFavorite(item)}
                  className="rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

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

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Filters" icon={<SlidersHorizontal className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FilterField label="Max price" value={filters.maxPrice} placeholder="$ / hr" onChange={(value) => setFilters((prev) => ({ ...prev, maxPrice: value }))} />
              <FilterField label="Max walk" value={filters.maxWalk} placeholder="minutes" onChange={(value) => setFilters((prev) => ({ ...prev, maxWalk: value }))} />
              <FilterField label="Min confidence" value={filters.minConfidence} placeholder="0-1" onChange={(value) => setFilters((prev) => ({ ...prev, minConfidence: value }))} />
              <FilterField label="Min availability" value={filters.minAvailability} placeholder="spots" onChange={(value) => setFilters((prev) => ({ ...prev, minAvailability: value }))} />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={filters.reservableOnly}
                  onChange={(event) => setFilters((prev) => ({ ...prev, reservableOnly: event.target.checked }))}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400"
                />
                Reservable only
              </label>
              <button
                onClick={clearFilters}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Reset filters
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
                Showing {visibleRecommendations.length}/{recommendations.length} lots
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
                Priority: {preference}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
                Walk cap: {filters.maxWalk || "any"} min
              </span>
            </div>
          </Panel>

          <Panel title="Data trust" icon={<Shield className="h-4 w-4" />}>
            <div className="space-y-2">
              <SummaryLine label="Provider" value={assistant?.provider_name ?? "--"} />
              <SummaryLine label="Status" value={assistant?.provider_status ?? "--"} />
              <SummaryLine label="Freshness" value={`${assistant?.freshness_minutes ?? "--"}m`} />
              <SummaryLine label="Updated" value={assistant?.last_updated_at ? new Date(assistant.last_updated_at).toLocaleString() : "--"} />
              <SummaryLine label="Route engine" value={assistant?.route_engine ?? "--"} />
            </div>
            {assistant?.provider_warning && (
              <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {assistant.provider_warning}
              </div>
            )}
            {!assistant?.provider_warning && (assistant?.freshness_minutes ?? 0) >= 12 && (
              <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Data is getting stale. Refresh before you leave.
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <Panel
            title="Live map"
            icon={<Navigation className="h-4 w-4" />}
            action={
              assistant ? (
                <button
                  onClick={() => openDirectionsTo(assistant.destination_position)}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Open directions
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : null
            }
          >
            {assistant ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-3">
                <RealMap
                  origin={assistant.origin}
                  destination={assistant.destination_position}
                  lots={visibleRecommendations.map((item) => item.lot)}
                  bestLot={recommended?.lot ?? null}
                  selectedLot={selectedLot}
                  onSelectLot={(lot) => setSelectedLotId(lot.id)}
                  onClearSelection={() => setSelectedLotId(null)}
                  destinationLabel={assistant.destination_label}
                />
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <InfoBadge label="Origin" value={formatPos(currentOrigin)} />
                  <InfoBadge label="Destination" value={formatPos(assistant.destination_position)} />
                  <InfoBadge label="Strategy" value={assistant.preference} />
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                  Selected area: {selectedDestination?.label ?? assistant.destination_label}
                </div>
                {selectedLot && (
                  <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm uppercase tracking-[0.28em] text-cyan-200">Map focus</div>
                        <div className="mt-1 text-lg font-semibold text-white">{selectedLot.name}</div>
                      </div>
                      <StatusBadge tone={selectedLot.reservation_supported ? "success" : "neutral"}>
                        {selectedLot.reservation_supported ? "Reservable" : "Walk-in"}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <InfoRow label="Available" value={`${selectedLot.available_spots}/${selectedLot.total_spots}`} />
                      <InfoRow label="Rate" value={`$${selectedLot.hourly_rate.toFixed(2)}/hr`} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => openLotDirections(selectedLot)}
                        className="rounded-full border border-cyan-300/20 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25"
                      >
                        Navigate here
                      </button>
                      {selectedLot.reservation_supported && (
                        <button
                          onClick={() => openLotReservation(selectedLot)}
                          className="rounded-full border border-emerald-300/20 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/25"
                        >
                          Reserve spot
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedLotId(null)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                      >
                        Clear focus
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                  {originOverride ? "GPS origin active" : "Using assistant default origin"}
                  {" · "}
                  Drag to pan, wheel to zoom, click markers to focus.
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                Search to see the route map and nearby lots.
              </div>
            )}
          </Panel>

          <Panel title="Recommended Lot" icon={<Target className="h-4 w-4" />}>
            {primaryRecommendation ? (
              <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-white">{primaryRecommendation.lot.name}</div>
                    <div className="mt-1 text-sm text-slate-300">{primaryRecommendation.lot.address}</div>
                  </div>
                  <StatusBadge tone={primaryRecommendation.lot.reservation_supported ? "success" : "warning"}>
                    {primaryRecommendation.lot.reservation_supported ? "Reserve" : "Walk-in"}
                  </StatusBadge>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <InfoRow label="Available" value={`${primaryRecommendation.lot.available_spots}/${primaryRecommendation.lot.total_spots}`} />
                  <InfoRow label="Rate" value={`$${primaryRecommendation.lot.hourly_rate.toFixed(2)}/hr`} />
                  <InfoRow label="Drive" value={`${primaryRecommendation.lot.drive_minutes} min`} />
                  <InfoRow label="Walk" value={`${primaryRecommendation.lot.walk_minutes} min`} />
                  <InfoRow label="Origin travel" value={`${primaryRecommendation.estimated_drive_minutes} min`} />
                  <InfoRow label="Est. total" value={`${primaryRecommendation.estimated_total_minutes} min`} />
                  <InfoRow label="Trip dist." value={`${primaryRecommendation.travel_distance.toFixed(2)} km`} />
                  <InfoRow label="Dist. to dest" value={primaryRecommendation.distance_to_destination.toFixed(3)} />
                  <InfoRow label="From origin" value={`${primaryRecommendation.distance_from_origin.toFixed(2)} km`} />
                </div>
                <p className="mt-4 text-sm text-cyan-50">{primaryRecommendation.reason}</p>
                <p className="mt-2 text-sm text-slate-300">{primaryRecommendation.tradeoff}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => openLotDirections(primaryRecommendation.lot)}
                    className="rounded-full border border-cyan-300/20 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25"
                  >
                    Navigate
                  </button>
                  {primaryRecommendation.lot.reservation_supported && (
                    <button
                      onClick={() => openLotReservation(primaryRecommendation.lot)}
                      className="rounded-full border border-emerald-300/20 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/25"
                    >
                      Reserve
                    </button>
                  )}
                </div>
                {topPicks.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {topPicks.map((item, index) => (
                      <button
                        key={item.lot.id}
                        onClick={() => setSelectedLotId(item.lot.id)}
                        className={`rounded-full border px-3 py-2 text-left text-xs font-semibold transition ${
                          selectedLot?.id === item.lot.id
                            ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-50"
                            : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-400/10"
                        }`}
                      >
                        <div className="uppercase tracking-[0.24em] text-[10px] text-slate-300">Top {index + 1}</div>
                        <div className="mt-1">{item.lot.name}</div>
                        <div className="mt-1 text-[10px] font-normal text-slate-300">
                          ${item.lot.hourly_rate.toFixed(2)} | {item.lot.walk_minutes}m walk | {Math.round(item.lot.confidence * 100)}%
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : recommendations.length > 0 ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-50">
                No lots match the current filters. Reset filters to see the best recommendation again.
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
            {topPicks.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {topPicks.map((item, index) => (
                  <button
                    key={item.lot.id}
                    onClick={() => setSelectedLotId(item.lot.id)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      selectedLot?.id === item.lot.id
                        ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-50"
                        : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-400/10"
                    }`}
                  >
                    {index + 1}. {item.lot.name} · {item.score.toFixed(2)}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {visibleRecommendations.map((item, index) => (
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => openLotDirections(item.lot)}
                      className="min-h-11 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                    >
                      Navigate
                    </button>
                    {item.lot.reservation_supported && (
                      <button
                        onClick={() => openLotReservation(item.lot)}
                        className="min-h-11 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-400/10"
                      >
                        Reserve
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedLotId(item.lot.id)}
                      className="min-h-11 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                    >
                      Focus map
                    </button>
                  </div>
                </div>
              ))}
              {visibleRecommendations.length === 0 && recommendations.length > 0 && (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-50">
                  No lots match the current filters. Reset filters to bring results back.
                </div>
              )}
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
                  history.map((item) => <HistoryRow key={`${item.searched_at}-${item.destination}-${item.mode}`} item={item} onRerun={rerunHistory} />)
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

        <div className="sm:hidden fixed inset-x-4 bottom-4 z-40">
          <button
            onClick={() => setMobileActionsOpen((current) => !current)}
            className="w-full rounded-3xl border border-white/10 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur"
          >
            {mobileActionsOpen ? "Hide quick actions" : "Show quick actions"}
          </button>
          {mobileActionsOpen && (
            <div className="mt-2 rounded-[1.6rem] border border-white/10 bg-slate-950/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="grid gap-2">
                <button onClick={() => void search(false)} disabled={busy} className="min-h-12 rounded-2xl border border-cyan-300/30 bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60">
                  Search parking
                </button>
                <button onClick={() => void search(true)} disabled={busy} className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-60">
                  Refresh availability
                </button>
                <button onClick={useCurrentLocation} disabled={busy} className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-60">
                  Use my location
                </button>
                <button onClick={saveFavorite} disabled={busy} className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-60">
                  Save favorite
                </button>
              </div>
            </div>
          )}
        </div>
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

function FilterField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.28em] text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
      />
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
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.35em] text-slate-400">
        <div className="flex items-center gap-2">
          {icon}
          {title}
        </div>
        {action}
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

function HistoryRow({ item, onRerun }: { item: AssistantHistoryEntry; onRerun: (item: AssistantHistoryEntry) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{item.destination_label}</div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300">
            {item.preference}
          </span>
          <button
            onClick={() => onRerun(item)}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
          >
            Rerun
          </button>
        </div>
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

function RealMap({
  origin,
  destination,
  lots,
  bestLot,
  selectedLot,
  onSelectLot,
  onClearSelection,
  destinationLabel,
}: {
  origin: [number, number];
  destination: [number, number];
  lots: ParkingLot[];
  bestLot: ParkingLot | null;
  selectedLot: ParkingLot | null;
  onSelectLot: (lot: ParkingLot) => void;
  onClearSelection: () => void;
  destinationLabel: string;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenter: [number, number];
    startZoom: number;
    pendingX: number;
    pendingY: number;
    frameId: number | null;
  } | null>(null);
  const [viewport, setViewport] = useState({ width: 768, height: 360 });
  const [center, setCenter] = useState<[number, number]>(selectedLot?.position ?? destination);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(15);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    setCenter(selectedLot?.position ?? destination);
    setPanOffset({ x: 0, y: 0 });
  }, [destination, selectedLot?.position?.[0], selectedLot?.position?.[1]]);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const updateSize = () => setViewport({ width: node.clientWidth || 768, height: node.clientHeight || 360 });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const tiles = useMemo(() => buildTiles(center, zoom, 3), [center, zoom]);
  const markers = useMemo(
    () => buildMarkers(origin, destination, lots, bestLot, selectedLot, zoom, center, viewport),
    [origin, destination, lots, bestLot, selectedLot, zoom, center, viewport],
  );
  const selectedMarker = markers.find((marker) => marker.id === selectedLot?.id) ?? null;
  const destinationMarker = markers.find((marker) => marker.id === "destination") ?? null;
  const originMarker = markers.find((marker) => marker.id === "origin") ?? null;
  const mapPath = useMemo(() => {
    if (!selectedMarker || !originMarker) return "";
    const path = [`M ${originMarker.left} ${originMarker.top}`];
    path.push(`L ${selectedMarker.left} ${selectedMarker.top}`);
    if (selectedMarker.id !== bestLot?.id && destinationMarker) {
      path.push(`L ${destinationMarker.left} ${destinationMarker.top}`);
    }
    return path.join(" ");
  }, [selectedMarker, originMarker, destinationMarker, bestLot?.id]);

  function updateCenterFromPointer(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    const { startX, startY, startCenter, startZoom } = dragRef.current;
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    const startPixel = latLngToWorldPixel(startCenter[0], startCenter[1], startZoom);
    const next = worldPixelToLatLng(startPixel.x - deltaX, startPixel.y - deltaY, startZoom);
    setCenter(next);
  }

  function commitDrag() {
    if (!dragRef.current) return;
    updateCenterFromPointer(dragRef.current.pendingX, dragRef.current.pendingY);
    setPanOffset({ x: 0, y: 0 });
    setIsSettling(true);
    window.setTimeout(() => setIsSettling(false), 180);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest("button, a")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenter: center,
      startZoom: zoom,
      pendingX: event.clientX,
      pendingY: event.clientY,
      frameId: null,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.pendingX = event.clientX;
    dragRef.current.pendingY = event.clientY;
    if (dragRef.current.frameId !== null) return;
    dragRef.current.frameId = window.requestAnimationFrame(() => {
      if (!dragRef.current) return;
      dragRef.current.frameId = null;
      setPanOffset({
        x: dragRef.current.pendingX - dragRef.current.startX,
        y: dragRef.current.pendingY - dragRef.current.startY,
      });
    });
  }

  function stopDragging(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      if (dragRef.current.frameId !== null) {
        window.cancelAnimationFrame(dragRef.current.frameId);
      }
      commitDrag();
      dragRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release errors
      }
    }
  }

  function zoomMap(next: number) {
    setZoom(Math.max(12, Math.min(19, next)));
    setPanOffset({ x: 0, y: 0 });
    setIsSettling(true);
    window.setTimeout(() => setIsSettling(false), 180);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setZoom((current) => Math.max(12, Math.min(19, current + direction)));
  }

  function resetView() {
    onClearSelection();
    setCenter(destination);
    setZoom(15);
    setPanOffset({ x: 0, y: 0 });
    setIsSettling(true);
    window.setTimeout(() => setIsSettling(false), 180);
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/90">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">Live map</div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Drag, zoom, and tap lots to inspect routes</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{destinationLabel}</span>
          <button
            onClick={resetView}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
          >
            Reset view
          </button>
        </div>
      </div>
      <div
        ref={mapRef}
        className={`relative h-[360px] overflow-hidden bg-[#0a1020] ${isDragging ? "cursor-grabbing" : "cursor-grab"} touch-none`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={handleWheel}
      >
        <div
          className="absolute inset-0 select-none will-change-transform"
          style={{
            transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
            transition: isDragging || isSettling ? "none" : "transform 180ms ease-out",
          }}
        >
          {tiles.map((tile) => (
            <img
              key={`${tile.x}-${tile.y}-${tile.z}`}
              src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
              alt=""
              className="absolute object-cover opacity-95"
              style={{ left: `${tile.offsetX}%`, top: `${tile.offsetY}%`, width: "14.2857%", height: "14.2857%" }}
            />
          ))}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.1),_transparent_44%)]" />
          {mapPath && (
            <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="route-line" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgb(34,211,238)" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <path d={mapPath} fill="none" stroke="url(#route-line)" strokeWidth="0.6" strokeDasharray="1.5 1" />
            </svg>
          )}
          {markers.map((marker) => (
            <button
              key={marker.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (marker.kind === "origin") {
                  setCenter(origin);
                  onClearSelection();
                  return;
                }
                if (marker.kind === "destination") {
                  setCenter(destination);
                  onClearSelection();
                  return;
                }
                const lot = lots.find((item) => item.id === marker.id);
                if (lot) {
                  onSelectLot(lot);
                  setCenter(lot.position);
                }
              }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-full outline-none transition ${marker.emphasis ? "z-20" : "z-10"} ${marker.kind === "lot" ? "hover:scale-105" : ""}`}
              style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full border text-[10px] font-black uppercase tracking-[0.22em] shadow-lg transition ${
                  marker.kind === "origin"
                    ? "border-cyan-200/80 bg-cyan-400 text-slate-950"
                    : marker.kind === "destination"
                      ? "border-amber-200/80 bg-amber-300 text-slate-950"
                      : marker.kind === "best"
                        ? "border-emerald-200/80 bg-emerald-400 text-slate-950"
                        : marker.id === selectedLot?.id
                          ? "border-cyan-100 bg-cyan-300 text-slate-950 ring-4 ring-cyan-300/30"
                        : marker.reservation_supported
                          ? "border-violet-200/70 bg-violet-400 text-slate-950"
                          : "border-rose-200/70 bg-rose-400 text-slate-950"
                }`}
              >
                {marker.kind === "origin" ? "You" : marker.kind === "destination" ? "Go" : marker.kind === "best" ? "Best" : "P"}
              </div>
              <div className="mt-2 max-w-[10rem] rounded-full border border-white/10 bg-slate-950/80 px-2 py-1 text-center text-[10px] text-slate-200">
                {marker.label}
              </div>
            </button>
          ))}
        </div>

        <div className="absolute left-4 top-4 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs text-slate-300 backdrop-blur">
          <div className="font-semibold text-white">OSM live tiles</div>
          <div className="mt-1">Real-world street map</div>
        </div>
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <button
            onClick={() => zoomMap(zoom + 1)}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-100 backdrop-blur transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
          >
            Zoom in
          </button>
          <button
            onClick={() => zoomMap(zoom - 1)}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-100 backdrop-blur transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
          >
            Zoom out
          </button>
        </div>
        <div className="absolute bottom-4 left-4 right-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-xs text-slate-300 backdrop-blur">
            <div className="font-semibold text-white">Best lot</div>
            <div className="mt-1">{bestLot ? bestLot.name : "n/a"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-xs text-slate-300 backdrop-blur">
            <div className="font-semibold text-white">Parking options</div>
            <div className="mt-1">{lots.length} lots</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-xs text-slate-300 backdrop-blur">
            <div className="font-semibold text-white">Reservation support</div>
            <div className="mt-1">{lots.filter((lot) => lot.reservation_supported).length} lots</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTiles(center: [number, number], zoom: number, radius: number) {
  const [x, y] = latLngToTile(center[0], center[1], zoom);
  const tiles: Array<{ x: number; y: number; z: number; offsetX: number; offsetY: number }> = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      tiles.push({
        x: x + dx,
        y: y + dy,
        z: zoom,
        offsetX: ((dx + radius) / (radius * 2 + 1)) * 100,
        offsetY: ((dy + radius) / (radius * 2 + 1)) * 100,
      });
    }
  }
  return tiles;
}

function buildMarkers(
  origin: [number, number],
  destination: [number, number],
  lots: ParkingLot[],
  bestLot: ParkingLot | null,
  selectedLot: ParkingLot | null,
  zoom: number,
  center: [number, number],
  viewport: { width: number; height: number },
) {
  const centerPixel = latLngToWorldPixel(center[0], center[1], zoom);
  const width = viewport.width || 768;
  const height = viewport.height || 360;
  const markers = [
    { id: "origin", kind: "origin", label: "You", coord: origin, reservation_supported: false, emphasis: true },
    { id: "destination", kind: "destination", label: "Destination", coord: destination, reservation_supported: false, emphasis: true },
    ...lots.map((lot) => ({
      id: lot.id,
      kind: bestLot?.id === lot.id ? "best" : "lot",
      label: lot.name,
      coord: lot.position,
      reservation_supported: lot.reservation_supported,
      emphasis: bestLot?.id === lot.id,
    })),
  ];

  return markers.map((marker) => {
    const pixel = latLngToWorldPixel(marker.coord[0], marker.coord[1], zoom);
    return {
      ...marker,
      active: selectedLot?.id === marker.id,
      left: 50 + ((pixel.x - centerPixel.x) / width) * 100,
      top: 50 + ((pixel.y - centerPixel.y) / height) * 100,
    };
  });
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y] as const;
}

function latLngToPixel(lat: number, lng: number, zoom: number) {
  return latLngToWorldPixel(lat, lng, zoom);
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPixelToLatLng(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lat, lng] as [number, number];
}
