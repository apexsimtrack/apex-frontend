import { describe, expect, it } from "vitest";
import { footerVersion } from "./footerVersion.mjs";

describe("footerVersion", () => {
  it("uses the commit count as the patch", () => {
    expect(footerVersion("1.0.1", "421")).toBe("1.0.421");
    expect(footerVersion("1.1.0", 12)).toBe("1.1.12");
  });

  it("keeps the package version when the commit count is missing", () => {
    expect(footerVersion("1.0.1", null)).toBe("1.0.1");
    expect(footerVersion("1.0.1", "")).toBe("1.0.1");
    expect(footerVersion("", null)).toBe("1.0.0");
  });
});
