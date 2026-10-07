import { describe, expect, it } from "vitest";
import {
  acceptSectorCountText,
  manualActivityFormSchema,
  parseSectorCountInput,
} from "./manualActivitySchema";

const EMPTY_FORM = {
  sim: "",
  trackId: "",
  carId: "",
  manualSessionKind: "RACE",
  position: "",
  totalDrivers: "",
  qualifyingPosition: "",
  sectorCount: "3",
  laps: [{ lapTime: "", sectors: ["", "", ""] }],
  caption: "",
  conditions: "DRY" as const,
};

function issuePaths(input: unknown): string[] {
  const result = manualActivityFormSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("manualActivityFormSchema", () => {
  it("reports sim, track and the missing lap together on an empty form", () => {
    const paths = issuePaths(EMPTY_FORM);
    expect(paths).toContain("sim");
    expect(paths).toContain("trackId");
    expect(paths).toContain("laps");
  });

  it("keeps the per-row format error instead of the array-level lap error", () => {
    const paths = issuePaths({
      ...EMPTY_FORM,
      sim: "iracing",
      trackId: "monza",
      laps: [{ lapTime: "not a time", sectors: ["", "", ""] }],
    });
    expect(paths).toContain("laps.0.lapTime");
    expect(paths).not.toContain("laps");
  });

  it("accepts a single valid lap", () => {
    const paths = issuePaths({
      ...EMPTY_FORM,
      sim: "iracing",
      trackId: "monza",
      laps: [{ lapTime: "1:32.456", sectors: ["", "", ""] }],
    });
    expect(paths).toEqual([]);
  });

  it.each([0, 3, 4, 7])("accepts %i configured sector slots", (count) => {
    const paths = issuePaths({
      ...EMPTY_FORM,
      sim: "iracing",
      trackId: "monza",
      sectorCount: String(count),
      laps: [{
        lapTime: "1:32.456",
        sectors: Array.from({ length: count }, () => ""),
      }],
    });
    expect(paths).toEqual([]);
  });

  it("validates every populated slot in partial arrays", () => {
    const paths = issuePaths({
      ...EMPTY_FORM,
      sim: "iracing",
      trackId: "monza",
      sectorCount: "4",
      laps: [{ lapTime: "1:32.456", sectors: ["20.000", "", "bad", "30.000"] }],
    });
    expect(paths).toContain("laps.0.sectors.2");
  });

  it("refuses a third digit or a sector count above 64", () => {
    expect(acceptSectorCountText("399999999")).toBeNull();
    expect(acceptSectorCountText("399")).toBeNull();
    expect(acceptSectorCountText("99")).toBeNull();
    expect(acceptSectorCountText("65")).toBeNull();
    expect(acceptSectorCountText("64")).toBe("64");
    expect(acceptSectorCountText("6")).toBe("6");
    expect(acceptSectorCountText("")).toBe("");
    expect(parseSectorCountInput("64")).toBe(64);
    expect(parseSectorCountInput("0")).toBe(0);
    expect(parseSectorCountInput("99")).toBeNull();
  });
});
