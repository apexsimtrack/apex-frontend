const FALLBACK_VERSION = "1.0.0";

/**
 * Footer version: major.minor from the store version, patch from the git
 * commit count. A missing count keeps the store version.
 */
export function footerVersion(packageVersion, commitCount) {
  const pkg =
    typeof packageVersion === "string" && packageVersion.trim()
      ? packageVersion.trim()
      : FALLBACK_VERSION;

  const raw =
    typeof commitCount === "number"
      ? String(commitCount)
      : String(commitCount ?? "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return pkg;

  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(pkg);
  if (!match) return pkg;

  return `${match[1]}.${match[2]}.${raw}`;
}
