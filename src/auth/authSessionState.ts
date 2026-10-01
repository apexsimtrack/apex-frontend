import { ApiError, type AuthUser } from "@/lib/api";

type MeQuerySlice = {
  data: AuthUser | undefined;
  isError: boolean;
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
};

export function isUnauthorizedMeError(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 401 || error.status === 403)
  );
}

/** Resolve session user from token presence and /api/auth/me query state. */
export function resolveAuthUser(
  tokenPresent: boolean,
  meQuery: MeQuerySlice,
): AuthUser | null {
  if (!tokenPresent) return null;
  if (meQuery.isError && isUnauthorizedMeError(meQuery.error)) {
    return null;
  }
  return meQuery.data ?? null;
}

/** True while a token exists but /api/auth/me has not settled. */
export function resolveAuthLoading(
  tokenPresent: boolean,
  meQuery: MeQuerySlice,
  meRefetching: boolean,
): boolean {
  const isUnauthorizedError =
    meQuery.isError && isUnauthorizedMeError(meQuery.error);
  return (
    tokenPresent &&
    !isUnauthorizedError &&
    meQuery.data === undefined &&
    (meRefetching || meQuery.isPending || meQuery.isFetching)
  );
}
