import { MAX_SECTOR_COUNT, SECTOR_TIMING_SOURCES } from "@apexsimtracker/session-contract/sims";

export { MAX_SECTOR_COUNT };

export type SectorTimingSource =
  | (typeof SECTOR_TIMING_SOURCES)[number]
  | string;

export type LegacySectorTriplet = {
  sector1Ms?: number | null;
  sector2Ms?: number | null;
  sector3Ms?: number | null;
};

function slot(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

/** Canonical frontend adapter. Arrays win; released three-field payloads remain readable. */
export function coerceSectorTimesMs(
  value: unknown,
  legacy?: LegacySectorTriplet | null,
  expectedCount?: number | null,
): (number | null)[] {
  if (Array.isArray(value)) {
    const count =
      expectedCount != null && expectedCount >= 0 && expectedCount <= MAX_SECTOR_COUNT
        ? expectedCount
        : value.length;
    return Array.from({ length: count }, (_, index) => slot(value[index]));
  }
  if (expectedCount === 0) return [];
  if (legacy && (expectedCount == null || expectedCount === 3)) {
    return [slot(legacy.sector1Ms), slot(legacy.sector2Ms), slot(legacy.sector3Ms)];
  }
  return expectedCount && expectedCount > 0
    ? Array.from({ length: expectedCount }, () => null)
    : [];
}

export function legacySectorAliases(sectors: readonly (number | null)[]) {
  return sectors.length === 3
    ? {
        sector1Ms: sectors[0] ?? null,
        sector2Ms: sectors[1] ?? null,
        sector3Ms: sectors[2] ?? null,
      }
    : { sector1Ms: null, sector2Ms: null, sector3Ms: null };
}

export function isLegacyEstimatedSectorSource(source: unknown): boolean {
  return source === "LEGACY_IRACING_GEOMETRIC";
}
