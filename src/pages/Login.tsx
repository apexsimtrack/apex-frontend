import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authLogin, authMe, ApiError, withRequestId } from "@/lib/api";
import { AUTH_ME_QUERY_KEY } from "@/contexts/AuthContext";
import { prefetchAfterAuthRedirect } from "@/lib/profileQueryKeys";
import type { WithRootError } from "@/lib/formWithRootError";
import {
  loginFormSchema,
  type LoginFormValues,
} from "@/lib/validation/authPages";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { getSafeReturnPath, parseAuthRedirectState } from "@/auth/authRedirect";
import { persistSessionTokenFromAuthPayload } from "@/auth/token";
import LoginWelcomePanel from "./login/LoginWelcomePanel";
import LoginFormCard from "./login/LoginFormCard";
import LoginHelpStrip from "./login/LoginHelpStrip";

const LOGIN_PATH = "/login";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [emailVerifiedMessage, setEmailVerifiedMessage] = useState(false);
  const [suspendedReason, setSuspendedReason] = useState<
    string | null | undefined
  >(undefined);
  const [suspendedLoginError, setSuspendedLoginError] =
    useState<ApiError | null>(null);

  const form = useForm<WithRootError<LoginFormValues>>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const authRedirect = parseAuthRedirectState(location.state);
  const returnFromQuery = searchParams.get("next");
  const postLoginPath = getSafeReturnPath(
    authRedirect.from ?? returnFromQuery,
    "/profile",
  );

  useEffect(() => {
    const state = location.state as { emailVerified?: boolean } | null;
    if (state?.emailVerified) {
      setEmailVerifiedMessage(true);
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.state, location.pathname]);

  async function onSubmit(values: LoginFormValues) {
    form.clearErrors("root");
    setEmailNotVerified(false);
    setSuspendedReason(undefined);
    setLoading(true);
    const trimmedEmail = values.email.trim();
    try {
      const data = await authLogin(trimmedEmail, values.password);
      const token = data.accessToken ?? data.token;
      if (!token || typeof token !== "string") {
        form.setError("root", {
          type: "server",
          message: "No token returned. Please try again.",
        });
        setLoading(false);
        return;
      }
      localStorage.setItem("apex_token", token);
      persistSessionTokenFromAuthPayload(data);
      try {
        await queryClient.fetchQuery({
          queryKey: AUTH_ME_QUERY_KEY,
          queryFn: authMe,
        });
        prefetchAfterAuthRedirect(
          queryClient,
          queryClient.getQueryData(AUTH_ME_QUERY_KEY),
          postLoginPath,
        );
      } catch (meErr) {
        localStorage.removeItem("apex_token");
        persistSessionTokenFromAuthPayload({});
        window.dispatchEvent(new Event("apex:auth"));
        form.setError("root", {
          type: "server",
          message: withRequestId(
            meErr instanceof Error
              ? meErr.message
              : "Could not load your session. Please try again.",
            meErr,
          ),
        });
        setLoading(false);
        return;
      }
      window.dispatchEvent(new Event("apex:auth"));
      navigate(postLoginPath, { replace: true });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
        form.setError("root", {
          type: "server",
          message: withRequestId(
            "Please verify your email before signing in.",
            err,
          ),
        });
      } else if (err instanceof ApiError && err.code === "ACCOUNT_SUSPENDED") {
        setSuspendedLoginError(err);
        setSuspendedReason(
          err.suspensionReason != null && err.suspensionReason.trim() !== ""
            ? err.suspensionReason.trim()
            : null,
        );
      } else {
        form.setError("root", {
          type: "server",
          message: withRequestId(
            err instanceof Error ? err.message : "Login failed.",
            err,
          ),
        });
      }
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta
        title={`Sign in | ${COMPANY_NAME}`}
        description={`Sign in to ${COMPANY_NAME} — your sim racing hub.`}
        path={LOGIN_PATH}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <div className="relative flex flex-1 flex-col justify-center overflow-hidden py-4 lg:py-8">
          <div
            className="pointer-events-none absolute -left-16 top-1/4 size-48 rounded-full opacity-40 blur-[64px] lg:size-64 lg:opacity-50"
            style={{
              background:
                "radial-gradient(closest-side, hsl(var(--apex-primary) / 0.12) 0%, transparent 75%)",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-16 bottom-1/4 size-48 rounded-full opacity-40 blur-[64px] lg:size-64 lg:opacity-50"
            style={{
              background:
                "radial-gradient(closest-side, hsl(var(--apex-primary) / 0.12) 0%, transparent 75%)",
            }}
            aria-hidden
          />

          <div className="relative space-y-8">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <LoginWelcomePanel />
              <LoginFormCard
                form={form}
                onSubmit={onSubmit}
                loading={loading}
                emailVerifiedMessage={emailVerifiedMessage}
                authRedirectMessage={authRedirect.message}
                emailNotVerified={emailNotVerified}
                suspendedReason={suspendedReason}
                suspendedLoginError={suspendedLoginError}
              />
            </div>
            <LoginHelpStrip locationState={location.state} />
          </div>
        </div>
      </div>
    </>
  );
}
