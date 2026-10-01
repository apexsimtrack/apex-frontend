import { describe, expect, it } from "vitest";
import { ApiError, type AuthUser } from "@/lib/api";
import { resolveAuthLoading, resolveAuthUser } from "@/auth/authSessionState";

const sampleUser: AuthUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: "USER",
  hasPro: false,
};

describe("resolveAuthUser", () => {
  it("returns cached user when token is in storage but React token state has not updated", () => {
    const user = resolveAuthUser(true, {
      data: sampleUser,
      isError: false,
      error: null,
      isPending: false,
      isFetching: false,
    });

    expect(user).toEqual(sampleUser);
  });

  it("returns null when no token is present", () => {
    const user = resolveAuthUser(false, {
      data: sampleUser,
      isError: false,
      error: null,
      isPending: false,
      isFetching: false,
    });

    expect(user).toBeNull();
  });

  it("returns null on confirmed unauthorized /me response", () => {
    const user = resolveAuthUser(true, {
      data: undefined,
      isError: true,
      error: new ApiError(401, "Unauthorized"),
      isPending: false,
      isFetching: false,
    });

    expect(user).toBeNull();
  });
});

describe("resolveAuthLoading", () => {
  it("is false when token exists and /me cache is already populated after login", () => {
    const loading = resolveAuthLoading(
      true,
      {
        data: sampleUser,
        isError: false,
        error: null,
        isPending: false,
        isFetching: false,
      },
      false,
    );

    expect(loading).toBe(false);
  });

  it("is false for a background /me refetch when a user is cached", () => {
    const loading = resolveAuthLoading(
      true,
      {
        data: sampleUser,
        isError: false,
        error: null,
        isPending: false,
        isFetching: true,
      },
      true,
    );

    expect(loading).toBe(false);
  });

  it("is true when token exists but /me has not resolved yet", () => {
    const loading = resolveAuthLoading(
      true,
      {
        data: undefined,
        isError: false,
        error: null,
        isPending: true,
        isFetching: true,
      },
      false,
    );

    expect(loading).toBe(true);
  });

  it("is false when logged out", () => {
    const loading = resolveAuthLoading(
      false,
      {
        data: undefined,
        isError: false,
        error: null,
        isPending: false,
        isFetching: false,
      },
      false,
    );

    expect(loading).toBe(false);
  });
});
