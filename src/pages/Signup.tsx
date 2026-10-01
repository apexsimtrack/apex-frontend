import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authRegister, authMe, withRequestId } from "@/lib/api";
import { AUTH_ME_QUERY_KEY } from "@/contexts/AuthContext";
import { prefetchAfterAuthRedirect } from "@/lib/profileQueryKeys";
import type { WithRootError } from "@/lib/formWithRootError";
import {
  signupFormSchema,
  type SignupFormValues,
} from "@/lib/validation/authPages";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { getSafeReturnPath, parseAuthRedirectState } from "@/auth/authRedirect";
import { persistSessionTokenFromAuthPayload } from "@/auth/token";
import SignupWelcomePanel from "./signup/SignupWelcomePanel";
import SignupFormCard from "./signup/SignupFormCard";
import SignupHelpStrip from "./signup/SignupHelpStrip";

const SIGNUP_PATH = "/signup";

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const authRedirect = parseAuthRedirectState(location.state);
  const [loading, setLoading] = useState(false);

  const form = useForm<WithRootError<SignupFormValues>>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: SignupFormValues) {
    form.clearErrors("root");
    setLoading(true);
    const trimmedEmail = values.email.trim();
    try {
      const data = await authRegister(
        trimmedEmail,
        values.password,
        values.name.trim() || undefined,
      );
      const token = data.accessToken ?? data.token;
      const hasToken = token && typeof token === "string";

      if (hasToken && !data.requiresVerification) {
        localStorage.setItem("apex_token", token as string);
        persistSessionTokenFromAuthPayload(data as { sessionToken?: string });
        try {
          await queryClient.fetchQuery({
            queryKey: AUTH_ME_QUERY_KEY,
            queryFn: authMe,
          });
          prefetchAfterAuthRedirect(
            queryClient,
            queryClient.getQueryData(AUTH_ME_QUERY_KEY),
            getSafeReturnPath(authRedirect.from, "/profile"),
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
              : "Could not load your session. Please try signing in.",
            meErr,
          ),
          });
          return;
        }
        window.dispatchEvent(new Event("apex:auth"));
        const returnTo = getSafeReturnPath(authRedirect.from, "/profile");
        navigate(returnTo, { replace: true });
        return;
      }

      sessionStorage.setItem("apex_verify_email", trimmedEmail);
      navigate("/verify-email", {
        replace: true,
        state: { email: trimmedEmail },
      });
    } catch (err) {
      form.setError("root", {
        type: "server",
        message: withRequestId(
          err instanceof Error
            ? err.message
            : "Signup failed. Email may already exist.",
          err,
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta
        title={`Create account | ${COMPANY_NAME}`}
        description={`Join ${COMPANY_NAME} — sim racing sessions, leaderboards, and community.`}
        path={SIGNUP_PATH}
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
              <SignupWelcomePanel />
              <SignupFormCard
                form={form}
                onSubmit={onSubmit}
                loading={loading}
                authRedirectMessage={authRedirect.message}
              />
            </div>
            <SignupHelpStrip locationState={location.state} />
          </div>
        </div>
      </div>
    </>
  );
}
