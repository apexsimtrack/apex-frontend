import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken } from "@/auth/token";
import { useAuth } from "@/contexts/AuthContext";
import { authLogout } from "@/lib/api";

/** Clears session locally and navigates home (server logout is best-effort). */
export function useSignOut() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      try {
        await authLogout();
      } catch {
        // Server revoke is best-effort; always clear local credentials.
      }
      await clearToken();
      setUser(null);
      navigate("/", { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, navigate, setUser]);

  return { signOut, isSigningOut };
}
