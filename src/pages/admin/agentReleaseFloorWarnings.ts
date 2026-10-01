const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export type AgentReleaseOs = "macos" | "windows" | "linux";

const OS_LABEL: Record<AgentReleaseOs, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function parseMajorMinorPatch(value: string): [number, number, number] | null {
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  const parts: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const raw = match[i] ?? "";
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) return null;
    parts.push(n);
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function isMajorMinorPatch(value: string): boolean {
  return parseMajorMinorPatch(value) !== null;
}

function compareMajorMinorPatch(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! < right[i]! ? -1 : 1;
  }
  return 0;
}

export function agentReleaseFloorWarnings(
  floor: string | null,
  active: Array<{ os: AgentReleaseOs; version: string | null }>,
): string[] {
  const lines: string[] = [];
  const floorParts = floor ? parseMajorMinorPatch(floor) : null;
  for (const row of active) {
    const version = row.version?.trim() ?? "";
    if (!version) continue;
    const label = OS_LABEL[row.os];
    const activeParts = parseMajorMinorPatch(version);
    if (!activeParts) {
      lines.push(`${label} will not be offered as an in-app update.`);
      continue;
    }
    if (floorParts && compareMajorMinorPatch(floorParts, activeParts) > 0) {
      lines.push(
        `${label}: the upload floor ${floor} is higher than the active release ${version}. Someone who installs that release would still be blocked.`,
      );
    }
  }
  return lines;
}
