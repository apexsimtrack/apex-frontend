import { describe, expect, it } from "vitest";
import { agentReleaseFloorWarnings } from "./agentReleaseFloorWarnings";

describe("agentReleaseFloorWarnings", () => {
  it("warns when the floor is higher than an OS active version", () => {
    expect(
      agentReleaseFloorWarnings("2.0.0", [
        { os: "macos", version: "1.2.3" },
        { os: "windows", version: "2.0.0" },
        { os: "linux", version: null },
      ]),
    ).toEqual([
      "macOS: the upload floor 2.0.0 is higher than the active release 1.2.3. Someone who installs that release would still be blocked.",
    ]);
  });

  it("warns when an active version is not major.minor.patch", () => {
    expect(
      agentReleaseFloorWarnings("1.0.0", [
        { os: "windows", version: "latest" },
        { os: "linux", version: "1.2.3-beta" },
      ]),
    ).toEqual([
      "Windows will not be offered as an in-app update.",
      "Linux will not be offered as an in-app update.",
    ]);
  });
});
