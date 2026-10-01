import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { formatLapMs, cn } from "@/lib/utils";
import { withRequestId } from "@/lib/api/errors";
import { useIsProUser, useAuth } from "@/contexts/AuthContext";
import { usePlatform } from "@/hooks/usePlatform";
import {
  useTelemetrySummary,
  useTelemetryTraces,
} from "@/features/telemetry-analysis/useSessionTelemetry";
import {
  isAgentOnlyTelemetryGate,
  telemetryIngestSourceLabel,
} from "@/features/telemetry-analysis/telemetryEligibility";
import type { TelemetrySummaryResponse } from "@/features/telemetry-analysis/types";
import type { NormalizedLap } from "@/features/session-detail/sessionDetailData";
import SessionTelemetryCharts from "./SessionTelemetryCharts";
import TelemetryLapPicker from "./TelemetryLapPicker";
import FullTelemetryModal, {
  type SectorLapTimes,
} from "./FullTelemetryModal";

export {
  aggregateTyreWearPct,
  telemetryOverviewFromTraces,
} from "./telemetryOverviewHelpers";

const SECTION = "rounded-xl bg-apex-surface-container-low p-4 shadow-lg";

type SessionTelemetryProps = {
  sessionId: string;
  ingestPath?: string | null;
  laps: NormalizedLap[];
  selectedLap: number | null;
  onSelectLap: (lapNumber: number) => void;
  bestLapLapNumber?: number | null;
  sectorStartsPct?: number[] | null;
};

type TabId = "driving" | "fuel" | "tyres";

export default function SessionTelemetry({
  sessionId,
  ingestPath,
  laps,
  selectedLap,
  onSelectLap,
  bestLapLapNumber,
  sectorStartsPct,
}: SessionTelemetryProps) {
  const { loading: authLoading } = useAuth();
  const isPro = useIsProUser();
  const { isNative } = usePlatform();
  const agentOnlyGate = isAgentOnlyTelemetryGate(ingestPath);
  const [tab, setTab] = useState<TabId>("driving");
  const [compareLap, setCompareLap] = useState<number | null>(null);
  const [fullOpen, setFullOpen] = useState(false);

  const {
    data: summary,
    isLoading,
    isError,
    error: summaryError,
  } = useTelemetrySummary(
    sessionId,
    !authLoading && isPro && !agentOnlyGate,
  );

  useEffect(() => {
    if (selectedLap != null) return;
    const defaultCandidate =
      summary?.defaultLapNumber ??
      summary?.laps.find((l) => l.isBestLap && !l.isOutLap)?.lapNumber ??
      bestLapLapNumber ??
      null;
    if (defaultCandidate != null) onSelectLap(defaultCandidate);
  }, [
    selectedLap,
    summary?.defaultLapNumber,
    summary?.laps,
    bestLapLapNumber,
    onSelectLap,
  ]);

  useEffect(() => {
    if (compareLap != null && compareLap === selectedLap) {
      setCompareLap(null);
    }
  }, [compareLap, selectedLap]);

  const canLoadTraces = Boolean(
    !authLoading &&
      isPro &&
      summary?.eligible &&
      summary.hasProAccess &&
      selectedLap != null &&
      summary.laps.some((l) => l.lapNumber === selectedLap && l.hasTraces),
  );

  const {
    data: traces,
    isLoading: tracesLoading,
    isError: tracesError,
    error: tracesQueryError,
  } = useTelemetryTraces(
      sessionId,
      selectedLap,
      compareLap,
      canLoadTraces && tab === "driving",
    );

  const paceLaps = useMemo(
    () =>
      laps.filter(
        (l) => l.timeMs > 0 && l.isValid !== false && l.isOutLap !== true,
      ),
    [laps],
  );

  const sectorTimes = useMemo<SectorLapTimes[]>(
    () =>
      laps.map((l) => ({
        lap: l.lap,
        timeMs: l.timeMs,
        sectorTimesMs: l.sectorTimesMs,
        sector1Ms: l.sector1Ms,
        sector2Ms: l.sector2Ms,
        sector3Ms: l.sector3Ms,
      })),
    [laps],
  );

  if (!isPro) {
    return (
      <section
        className={`${SECTION} text-center`}
        data-testid="telemetry-pro-gate"
      >
        <h3 className="font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
          Telemetry Analysis
        </h3>
        <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
          Unlock driving traces, fuel strategy, and tyre insights with Apex Pro.
        </p>
        <Link
          to="/pricing"
          className="mt-4 inline-flex rounded-full bg-apex-primary px-4 py-2 font-apex-body text-xs font-bold uppercase tracking-widest text-apex-on-primary"
        >
          Upgrade to Pro
        </Link>
      </section>
    );
  }

  if (agentOnlyGate) {
    return (
      <section
        className={`${SECTION} text-center`}
        data-testid="telemetry-agent-gate"
      >
        <h3 className="font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
          Telemetry Analysis
        </h3>
        <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
          Manual form and JSON uploads store lap times only. Install the Apex
          Agent or upload an .ibt file to capture driving traces, fuel, and tyre
          data.
        </p>
        {!isNative ? (
          <Link
            to="/agent"
            className="mt-4 inline-flex rounded-full border border-apex-outline-variant/30 px-4 py-2 font-apex-body text-xs font-bold uppercase tracking-widest text-apex-on-surface"
          >
            Get Apex Agent
          </Link>
        ) : null}
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className={SECTION} data-testid="telemetry-loading">
        <h3 className="mb-3 font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
          Telemetry Analysis
        </h3>
        <div className="h-40 animate-pulse rounded-lg bg-apex-surface-container" />
      </section>
    );
  }

  if (isError || !summary) {
    return (
      <section className={SECTION} data-testid="telemetry-error">
        <h3 className="font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
          Telemetry Analysis
        </h3>
        <p className="mt-2 font-apex-body text-sm text-apex-error">
          {withRequestId(
            "Unable to load telemetry for this session.",
            summaryError,
          )}
        </p>
      </section>
    );
  }

  if (!summary.eligible) {
    return (
      <section className={SECTION} data-testid="telemetry-ineligible">
        <h3 className="font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
          Telemetry Analysis
        </h3>
        <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
          {summary.eligibilityReason === "NO_DATA"
            ? "No driving telemetry is available for this session yet."
            : "Telemetry analysis is not available for this session."}
        </p>
      </section>
    );
  }

  const sourceLabel = telemetryIngestSourceLabel(ingestPath);
  const hasFuel = (summary.fuel?.perLap.length ?? 0) > 0;
  const hasTyres = (summary.tyres?.perLap.length ?? 0) > 0;
  const tabItems = (
    [
      ["driving", "Driving", true],
      ["fuel", "Fuel", hasFuel],
      ["tyres", "Tyres", hasTyres],
    ] as const
  ).filter(([, , enabled]) => enabled);

  return (
    <div className="space-y-4" data-testid="session-telemetry">
      <LapPaceProgression
        laps={paceLaps}
        bestLapLapNumber={bestLapLapNumber}
        selectedLap={selectedLap}
      />

      <section className={SECTION}>
        <div className="mb-3 space-y-3">
          <div>
            <h3 className="font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
              Telemetry Analysis
            </h3>
            <p className="mt-0.5 font-apex-body text-[11px] text-apex-on-surface-variant">
              {sourceLabel}
              {summary.simKey ? ` · ${summary.simKey}` : ""}
            </p>
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Telemetry views"
          >
            {tabItems.map(([id, label]) => {
              const isActive = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(id)}
                  className={cn(
                    "shrink-0 rounded-apex-sm px-4 py-2 font-apex-body text-xs font-bold transition-colors",
                    isActive
                      ? "bg-apex-primary text-white"
                      : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "driving" && (
          <div className="space-y-4" role="tabpanel">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <TelemetryLapPicker
                  laps={summary.laps}
                  selectedLap={selectedLap}
                  compareLap={compareLap}
                  onSelectLap={onSelectLap}
                  onSelectCompare={setCompareLap}
                />
              </div>
              {traces && (
                <button
                  type="button"
                  onClick={() => setFullOpen(true)}
                  className="group flex shrink-0 items-center gap-2 self-end rounded-apex-sm border border-apex-outline-variant/25 bg-apex-surface-container-high px-3.5 py-2.5 font-apex-body text-xs font-bold text-apex-on-surface transition-all hover:border-apex-primary/50 hover:bg-apex-surface-container-highest"
                  data-testid="open-full-telemetry"
                >
                  <Maximize2
                    className="size-4 text-apex-primary transition-transform group-hover:scale-110"
                    aria-hidden
                  />
                  <span className="hidden sm:inline">View Full Telemetry</span>
                  <span className="sm:hidden">Full</span>
                </button>
              )}
            </div>
            {tracesLoading ? (
              <div className="h-48 animate-pulse rounded-lg bg-apex-surface-container" />
            ) : tracesError ? (
              <p className="font-apex-body text-sm text-apex-error">
                {withRequestId(
                  "Failed to load driving traces for this lap.",
                  tracesQueryError,
                )}
              </p>
            ) : traces ? (
              <SessionTelemetryCharts traces={traces} />
            ) : (
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                Select a lap with traces to view driver inputs.
              </p>
            )}
            {traces && (
              <FullTelemetryModal
                isOpen={fullOpen}
                onClose={() => setFullOpen(false)}
                sessionId={sessionId}
                traces={traces}
                laps={summary.laps}
                selectedLap={selectedLap}
                compareLap={compareLap}
                onSelectLap={onSelectLap}
                onSelectCompare={setCompareLap}
                sectorTimes={sectorTimes}
                sectorStartsPct={sectorStartsPct}
              />
            )}
          </div>
        )}

        {tab === "fuel" && (
          <div role="tabpanel">
            <FuelPanel summary={summary} />
          </div>
        )}

        {tab === "tyres" && (
          <div role="tabpanel">
            <TyresPanel summary={summary} selectedLap={selectedLap} />
          </div>
        )}
      </section>
    </div>
  );
}

function LapPaceProgression({
  laps,
  bestLapLapNumber,
  selectedLap,
}: {
  laps: NormalizedLap[];
  bestLapLapNumber?: number | null;
  selectedLap: number | null;
}) {
  if (laps.length === 0) {
    return (
      <section className={SECTION}>
        <h3 className="mb-2 font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
          Lap pace progression
        </h3>
        <p className="font-apex-body text-sm text-apex-on-surface-variant">
          No lap times available.
        </p>
      </section>
    );
  }

  const times = laps.map((l) => l.timeMs);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);
  const w = 300;
  const h = 80;
  const points = laps
    .map((lap, i) => {
      const x = laps.length === 1 ? w / 2 : (i / (laps.length - 1)) * w;
      const y = h - 8 - ((lap.timeMs - min) / span) * (h - 16);
      return `${x},${y}`;
    })
    .join(" ");

  const selected = laps.find((l) => l.lap === selectedLap);
  const best =
    bestLapLapNumber != null
      ? laps.find((l) => l.lap === bestLapLapNumber)
      : laps.find((l) => l.timeMs === min);

  return (
    <section className={SECTION}>
      <h3 className="mb-3 font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
        Lap pace progression
      </h3>
      <div className="relative h-24">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={points}
          />
        </svg>
      </div>
      <p className="mt-2 font-apex-body text-[11px] text-apex-on-surface-variant">
        {selected
          ? `Viewing Lap ${selected.lap} · ${formatLapMs(selected.timeMs)}`
          : `${laps.length} timed laps`}
        {best ? ` · Best Lap ${best.lap} · ${formatLapMs(best.timeMs)}` : ""}
      </p>
    </section>
  );
}

function FuelPanel({ summary }: { summary: TelemetrySummaryResponse }) {
  const fuel = summary.fuel;
  if (!fuel || fuel.perLap.length === 0) {
    return (
      <p className="font-apex-body text-sm text-apex-on-surface-variant">
        No fuel telemetry for this session.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Tank"
          value={
            fuel.tankCapacityL != null ? `${fuel.tankCapacityL.toFixed(1)} L` : "—"
          }
        />
        <Stat
          label="Avg / lap"
          value={
            fuel.avgFuelPerLapL != null
              ? `${fuel.avgFuelPerLapL.toFixed(2)} L`
              : "—"
          }
        />
        <Stat
          label="Proj. laps"
          value={(() => {
            const projected = fuel.projectedLaps ?? fuel.projectedLapsFromFull;
            return projected != null ? String(projected) : "—";
          })()}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[240px] text-left">
          <thead>
            <tr className="border-b border-apex-outline-variant/15 font-apex-body text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
              <th className="py-2">Lap</th>
              <th className="py-2">Level</th>
              <th className="py-2">Used</th>
            </tr>
          </thead>
          <tbody className="font-apex-body text-xs text-apex-on-surface">
            {fuel.perLap.map((row) => (
              <tr
                key={row.lapNumber}
                className="border-b border-apex-outline-variant/5"
              >
                <td className="py-2">{row.lapNumber}</td>
                <td className="py-2">
                  {row.fuelLevelL != null
                    ? `${row.fuelLevelL.toFixed(2)} L`
                    : "—"}
                </td>
                <td className="py-2">
                  {row.fuelUsedL != null
                    ? `${row.fuelUsedL.toFixed(2)} L`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TyresPanel({
  summary,
  selectedLap,
}: {
  summary: TelemetrySummaryResponse;
  selectedLap: number | null;
}) {
  const perLap = summary.tyres?.perLap ?? [];
  if (perLap.length === 0) {
    return (
      <p className="font-apex-body text-sm text-apex-on-surface-variant">
        No tyre telemetry for this session.
      </p>
    );
  }
  const row =
    perLap.find((t) => t.lapNumber === selectedLap) ??
    perLap[perLap.length - 1]!;
  const corners: { label: string; temp?: number; wear?: number }[] = [
    { label: "Front left", temp: row.corners.lf, wear: row.wear?.lf },
    { label: "Front right", temp: row.corners.rf, wear: row.wear?.rf },
    { label: "Rear left", temp: row.corners.lr, wear: row.wear?.lr },
    { label: "Rear right", temp: row.corners.rr, wear: row.wear?.rr },
  ];

  return (
    <div className="space-y-3">
      <p className="font-apex-body text-[11px] text-apex-on-surface-variant">
        Lap {row.lapNumber}
        {row.frontAvg != null || row.rearAvg != null
          ? ` · Front avg ${row.frontAvg?.toFixed(0) ?? "—"}°C · Rear avg ${row.rearAvg?.toFixed(0) ?? "—"}°C`
          : ""}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {corners.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-apex-outline-variant/15 bg-apex-surface-container p-3"
          >
            <p className="font-apex-body text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
              {c.label}
            </p>
            <p className="mt-1 font-apex-headline text-lg font-bold text-apex-on-surface">
              {c.temp != null ? `${Math.round(c.temp)}°C` : "—"}
            </p>
            <p className="font-apex-body text-[11px] text-apex-on-surface-variant">
              {c.wear != null ? `${Math.round(c.wear)}% wear` : "Wear —"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-apex-surface-container p-2.5">
      <p className="font-apex-body text-[9px] font-bold uppercase text-apex-on-surface-variant">
        {label}
      </p>
      <p className="font-apex-headline text-sm font-bold text-apex-on-surface">
        {value}
      </p>
    </div>
  );
}

