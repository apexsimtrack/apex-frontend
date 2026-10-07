/**
 * Form schema for the Manual Entry (`/manual`) page.
 *
 * Backend-bound fields (sim, track, car, session kind, position, grid size,
 * qualifying position, lap times, caption, conditions, per-lap sectors) are
 * validated here and submitted via ManualActivityForm → POST manual-activity.
 *
 * The core object subset (sim/track/car/kind/positions/lapTime/caption) still
 * delegates to the shared core schema so create rules stay aligned.
 */
import { z } from "zod";
import {
  createManualActivityFormSchema as createCoreManualActivityFormSchema,
  LAP_FORMAT_MSG,
} from "@/lib/validation/manualActivity";

/** Track conditions persisted on Session.conditions. */
export const MANUAL_CONDITIONS = [
  { value: "DRY" as const, label: "Dry" },
  { value: "WET" as const, label: "Wet" },
  { value: "MIXED" as const, label: "Mixed" },
];

export type ManualCondition = "DRY" | "WET" | "MIXED";

const SECTOR_FORMAT_MSG =
  "Use ss.mmm (e.g. 26.452) or m:ss.mmm — three-digit milliseconds.";

export const MANUAL_SECTOR_COUNT_MAX = 64;

/** 64 is two digits. A third digit, or any value above 64, is not a legal draft. */
export function acceptSectorCountText(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 2) return null;
  if (digits === "") return "";
  if (Number(digits) > MANUAL_SECTOR_COUNT_MAX) return null;
  return digits;
}

export function parseSectorCountInput(raw: string): number | null {
  const accepted = acceptSectorCountText(raw);
  if (accepted == null || accepted === "") return null;
  return Number(accepted);
}

/**
 * Parse a frontend-only sector time (`s1`/`s2`/`s3`) to milliseconds.
 *
 * Same `ss.mmm` / `m:ss.mmm` shape as strict lap times (exactly 3 ms digits,
 * comma→dot), but deliberately does NOT reuse `parseStrictManualLapTimeToMs`:
 * that parser enforces the full-lap floor (`MANUAL_LAP_MS_MIN` = 10s), which
 * would reject a legitimately-formatted sub-10s sector like "9.876".
 * Returns null for empty, partial, or invalid input (never throws).
 */
export function parseSectorTimeToMs(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!s) return null;

  const withColon = /^(\d+):([0-5]\d)\.(\d{3})$/;
  const secondsOnly = /^(\d+)\.(\d{3})$/;

  const m1 = s.match(withColon);
  if (m1) {
    const total =
      parseInt(m1[1]!, 10) * 60_000 +
      parseInt(m1[2]!, 10) * 1_000 +
      parseInt(m1[3]!, 10);
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  const m2 = s.match(secondsOnly);
  if (m2) {
    const total = parseInt(m2[1]!, 10) * 1_000 + parseInt(m2[2]!, 10);
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  return null;
}

/** Frontend-only sector-time format check (UX validation for `s1`/`s2`/`s3`). */
export function isValidSectorTimeFormat(input: string): boolean {
  return parseSectorTimeToMs(input) != null;
}

const appLapRowSchema = z.object({
  lapTime: z.string(),
  /** Ordered sector inputs; empty slots are submitted as null. */
  sectors: z.array(z.string()).max(64),
});

export function createManualActivityFormSchema(
  telemetryMinLapRows?: number | null,
) {
  const coreSchema = createCoreManualActivityFormSchema(telemetryMinLapRows);

  return z
    .object({
      sim: z.string(),
      trackId: z.string(),
      carId: z.string(),
      manualSessionKind: z.string(),
      position: z.string(),
      totalDrivers: z.string(),
      qualifyingPosition: z.string(),
      sectorCount: z.string(),
      laps: z.array(appLapRowSchema),
      caption: z.string().max(280, "Caption must be at most 280 characters."),
      /** Persisted as Session.conditions. */
      conditions: z.enum(["DRY", "WET", "MIXED"]),
    })
    .superRefine((data, ctx) => {
      // Delegate shared validation to the core schema so create rules (positions,
      // grid size, lap format, caps) stay identical. Paths align 1:1.
      const coreResult = coreSchema.safeParse({
        sim: data.sim,
        trackId: data.trackId,
        carId: data.carId,
        manualSessionKind: data.manualSessionKind,
        position: data.position,
        totalDrivers: data.totalDrivers,
        qualifyingPosition: data.qualifyingPosition,
        laps: data.laps.map((row) => ({ lapTime: row.lapTime })),
        caption: data.caption,
      });
      if (!coreResult.success) {
        // Re-emit shared validation issues, preserving message + field path so
        // errors surface on the matching inputs (lap indices align 1:1).
        for (const issue of coreResult.error.issues) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: issue.message,
            path: issue.path,
          });
        }
      }

      // Sector-time format validation (optional fields; empty is OK).
      const count = parseSectorCountInput(data.sectorCount);
      if (count == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sector count must be an integer from 0 to 64.",
          path: ["sectorCount"],
        });
      }
      data.laps.forEach((row, i) => {
        if (count == null) return;
        if (row.sectors.length !== count) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Expected ${count} sector values.`,
            path: ["laps", i, "sectors"],
          });
        }
        row.sectors.forEach((sector, sectorIndex) => {
          const raw = sector?.trim() ?? "";
          if (!raw) return;
          if (!isValidSectorTimeFormat(raw)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: SECTOR_FORMAT_MSG,
              path: ["laps", i, "sectors", sectorIndex],
            });
          }
        });
      });
    });
}

export const manualActivityFormSchema = createManualActivityFormSchema();

export type ManualActivityFormValues = z.infer<
  typeof manualActivityFormSchema
>;

export { LAP_FORMAT_MSG };
