import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authMe,
  registerAuthExpiredHandler,
  ApiError,
  withRequestId,
  type AuthUser,
} from "@/lib/api";
import { storedAccessTokenSubject } from "@/lib/impersonation";
import { resolveAuthLoading, resolveAuthUser } from "@/auth/authSessionState";

/** TanStack Query key for GET /api/auth/me — invalidate or setQueryData from profile/settings. */
export const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readHasToken(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    Boolean(localStorage.getItem("apex_token"))
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasTokenState, setHasTokenState] = useState(readHasToken);
  const [error, setError] = useState<string | null>(null);
  const [meRefetching, setMeRefetching] = useState(false);
  // Re-render after an identity swap: queryClient.clear() destroys the query this provider's
  // observer is attached to, and the observer only re-attaches to the rebuilt query on render.
  const [, bumpIdentityEpoch] = useState(0);
  const handlingExpiry = useRef(false);

  const syncTokenFromStorage = useCallback(() => {
    setHasTokenState(readHasToken());
  }, []);

  /** Keep token state, auth/me cache, and private query caches aligned with localStorage. */
  const applyTokenStorageToQueryClient = useCallback(() => {
    syncTokenFromStorage();
    if (!readHasToken()) {
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      // Drop cached API results so logged-out views cannot read prior session data from memory.
      queryClient.clear();
    } else {
      // Login / signup / verify-email call fetchQuery before apex:auth; the cache already has a
      // fresh user matching the JWT `sub`. Skip refetch in that case.
      //
      // If the token's subject no longer matches the cached user (e.g. exit impersonation:
      // cache holds the target user but `apex_token` was swapped back to the admin JWT),
      // invalidateQueries alone leaves stale data visible until refetch completes, so AdminRoute
      // can redirect using the wrong role. Remove cached session first so loading stays true until
      // /api/auth/me returns for the new token.
      const cached = queryClient.getQueryData<AuthUser | null>(
        AUTH_ME_QUERY_KEY,
      );
      const tokenSub = storedAccessTokenSubject();
      const identityChanged =
        cached != null &&
        tokenSub != null &&
        String(cached.id) !== String(tokenSub);

      if (cached == null) {
        void queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
      } else if (identityChanged) {
        queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
      }
    }
  }, [queryClient, syncTokenFromStorage]);

  useEffect(() => {
    syncTokenFromStorage();
    const onAuth = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          exitImpersonation?: boolean;
          impersonation?: boolean;
        }>
      ).detail;
      // An impersonation swap can land here without a document reload (e.g. fetchApi restoring the
      // admin after a 401). Drop every cached query so billing, settings, activity, etc. from the
      // prior identity cannot leak across the switch.
      if (detail?.exitImpersonation || detail?.impersonation) {
        syncTokenFromStorage();
        queryClient.clear();
        if (!readHasToken()) {
          queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
        } else {
          // invalidateQueries cannot reach a cleared cache, so fetch /api/auth/me directly with
          // the swapped JWT instead of leaving the previous identity on screen. The rejection is
          // swallowed here because the observer below renders the error state.
          void queryClient
            .fetchQuery({ queryKey: AUTH_ME_QUERY_KEY, queryFn: authMe })
            .catch(() => undefined);
        }
        bumpIdentityEpoch((n) => n + 1);
        return;
      }
      applyTokenStorageToQueryClient();
    };
    window.addEventListener("apex:auth", onAuth);
    return () => window.removeEventListener("apex:auth", onAuth);
  }, [applyTokenStorageToQueryClient, queryClient, syncTokenFromStorage]);

  // Storage can lead React state by one commit after login (token written + /me cached before apex:auth).
  const tokenPresent = hasTokenState || readHasToken();

  const meQuery = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: authMe,
    enabled: tokenPresent,
    retry: (failureCount, err) => {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        return false;
      }
      return failureCount < 1;
    },
  });

  // Drop stale user data on unauthorized errors (TanStack Query keeps last success by default).
  useEffect(() => {
    if (!meQuery.isError || !meQuery.error) return;
    const err = meQuery.error;
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      queryClient.setQueryData<AuthUser | null>(AUTH_ME_QUERY_KEY, null);
    }
  }, [meQuery.isError, meQuery.error, queryClient]);

  // Mirror previous error semantics from manual refreshUser (network vs generic).
  useEffect(() => {
    if (!tokenPresent) {
      setError(null);
      return;
    }
    if (!meQuery.isError || !meQuery.error) {
      setError(null);
      return;
    }
    const e = meQuery.error;
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      setError(null);
    } else if (e instanceof ApiError && e.status === 0) {
      setError(e.message);
    } else if (e instanceof Error) {
      setError(withRequestId(e.message, e));
    } else {
      setError(withRequestId("Failed to fetch user.", e));
    }
  }, [tokenPresent, meQuery.isError, meQuery.error]);

  const user = useMemo(
    () => resolveAuthUser(tokenPresent, meQuery),
    [tokenPresent, meQuery],
  );

  // Has token but /api/auth/me not resolved yet (success or confirmed 401/403). Use isFetching so
  // retries and background refetches keep ProtectedRoute from bouncing to /login while user is null.
  const loading = resolveAuthLoading(tokenPresent, meQuery, meRefetching);

  const refreshUser = useCallback(async () => {
    if (!readHasToken()) {
      setHasTokenState(false);
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      return;
    }
    setError(null);
    await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
  }, [queryClient]);

  const refreshMe = useCallback(async () => {
    if (!readHasToken()) {
      setHasTokenState(false);
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      return;
    }
    setMeRefetching(true);
    try {
      await queryClient.refetchQueries({ queryKey: AUTH_ME_QUERY_KEY });
    } finally {
      setMeRefetching(false);
    }
  }, [queryClient]);

  const setUser = useCallback(
    (next: AuthUser | null) => {
      queryClient.setQueryData<AuthUser | null>(AUTH_ME_QUERY_KEY, next);
    },
    [queryClient],
  );

  const value = useMemo(
    () => ({ user, loading, error, refreshUser, refreshMe, setUser }),
    [user, loading, error, refreshUser, refreshMe, setUser],
  );

  // Register global auth expired handler
  useEffect(() => {
    registerAuthExpiredHandler(async () => {
      if (handlingExpiry.current) return;
      handlingExpiry.current = true;

      try {
        if (!readHasToken()) {
          queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
      } finally {
        handlingExpiry.current = false;
      }
    });
  }, [queryClient]);

  // Re-run auth when apex_token changes in another tab (same-tab updates use apex:auth).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "apex_token") {
        applyTokenStorageToQueryClient();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyTokenStorageToQueryClient]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useIsProUser(): boolean {
  const { user, loading } = useAuth();
  if (loading) return false;
  return user?.hasPro === true;
}
