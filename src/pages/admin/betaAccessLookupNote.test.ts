import { describe, expect, it } from "vitest";
import { betaAccessLookupNote } from "@/pages/admin/AdminBetaAccessPanel";
import type { AdminBetaAccessEmailLookup } from "@/lib/api/adminSubscriptions";

function lookup(
  overrides: Partial<AdminBetaAccessEmailLookup> = {},
): AdminBetaAccessEmailLookup {
  return {
    email: "beta@example.com",
    accountExists: false,
    accountDeleted: false,
    linksImmediately: false,
    user: null,
    blockingGrant: null,
    ...overrides,
  };
}

describe("betaAccessLookupNote", () => {
  it("names the account that the grant will link to", () => {
    const note = betaAccessLookupNote(
      lookup({
        accountExists: true,
        linksImmediately: true,
        user: { id: "u1", email: "beta@example.com", name: "Beta User" },
      }),
    );

    expect(note.tone).toBe("found");
    expect(note.message).toContain("Beta User");
  });

  it("omits an empty name from the found copy", () => {
    const note = betaAccessLookupNote(
      lookup({
        accountExists: true,
        linksImmediately: true,
        user: { id: "u1", email: "beta@example.com", name: "  " },
      }),
    );

    expect(note.message).toBe(
      "Account found. Beta access starts as soon as you grant it.",
    );
  });

  it("explains that an unknown email is reserved until signup", () => {
    const note = betaAccessLookupNote(lookup());

    expect(note.tone).toBe("reserved");
    expect(note.message).toContain("No account with this email yet");
  });

  it("warns that a deleted account will not be linked", () => {
    const note = betaAccessLookupNote(
      lookup({ accountExists: true, accountDeleted: true }),
    );

    expect(note.tone).toBe("warning");
    expect(note.message).toContain("deleted");
  });

  it("warns about the grant that would make creation fail", () => {
    const note = betaAccessLookupNote(
      lookup({
        accountExists: true,
        linksImmediately: true,
        user: { id: "u1", email: "beta@example.com", name: "Beta User" },
        blockingGrant: {
          id: "grant-1",
          status: "ACTIVE",
          expiresAt: "2026-10-22T21:46:55.113Z",
        },
      }),
    );

    expect(note.tone).toBe("warning");
    expect(note.message).toContain("active grant");
  });
});
