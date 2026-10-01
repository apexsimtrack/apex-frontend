import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { verifyEmail, resendVerificationCode, authMe, withRequestId } from "@/lib/api";
import { AUTH_ME_QUERY_KEY } from "@/contexts/AuthContext";
import { prefetchAfterAuthRedirect } from "@/lib/profileQueryKeys";
import type { WithRootError } from "@/lib/formWithRootError";
import {
  verifyEmailCodeSchema,
  type VerifyEmailCodeValues,
} from "@/lib/validation/authPages";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { persistSessionTokenFromAuthPayload } from "@/auth/token";
import VerifyEmailWelcomePanel from "./verify-email/VerifyEmailWelcomePanel";
import VerifyEmailFormCard from "./verify-email/VerifyEmailFormCard";
import VerifyEmailHelpStrip from "./verify-email/VerifyEmailHelpStrip";

const PENDING_VERIFY_KEY = "apex_verify_email";
const RESEND_COOLDOWN_SEC = 60;
const VERIFY_EMAIL_PATH = "/verify-email";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmailState] = useState<string>(() => {
    if (typeof sessionStorage === "undefined") return "";
    return (sessionStorage.getItem(PENDING_VERIFY_KEY) ?? "").trim();
  });
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const form = useForm<WithRootError<VerifyEmailCodeValues>>({
    resolver: zodResolver(verifyEmailCodeSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    const fromState = (location.state as { email?: string } | null)?.email;
    const fromStorage =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(PENDING_VERIFY_KEY)
        : null;
    const resolved = (fromState ?? fromStorage ?? "").trim();
    if (resolved) setEmailState(resolved);
  }, [location.state]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function onSubmit(values: VerifyEmailCodeValues) {
    if (!email.trim()) {
      form.setError("root", {
        type: "server",
        message: "Email is missing. Please sign up again.",
      });
      return;
    }
    form.clearErrors("root");
    setSuccess(null);
    setLoading(true);
    const trimmedCode = values.code.trim();
    try {
      const data = await verifyEmail(email, trimmedCode);
      const token = data.accessToken ?? data.token;
      if (token && typeof token === "string") {
        localStorage.setItem("apex_token", token);
        persistSessionTokenFromAuthPayload(data);
        sessionStorage.removeItem(PENDING_VERIFY_KEY);
        try {
          await queryClient.fetchQuery({
            queryKey: AUTH_ME_QUERY_KEY,
            queryFn: authMe,
          });
          prefetchAfterAuthRedirect(
            queryClient,
            queryClient.getQueryData(AUTH_ME_QUERY_KEY),
            "/profile",
          );
        } catch (meErr) {
          localStorage.removeItem("apex_token");
          persistSessionTokenFromAuthPayload({});
          sessionStorage.setItem(PENDING_VERIFY_KEY, email);
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
        navigate("/profile", { replace: true });
        return;
      }
      sessionStorage.removeItem(PENDING_VERIFY_KEY);
      setSuccess("Email verified. You can sign in now.");
      setTimeout(
        () =>
          navigate("/login", {
            replace: true,
            state: { emailVerified: true },
          }),
        1500,
      );
    } catch (err) {
      const msg = withRequestId(
        err instanceof Error ? err.message : "Verification failed.",
        err,
      );
      form.setError("root", { type: "server", message: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email.trim()) {
      form.setError("root", {
        type: "server",
        message: "Email is missing. Please sign up again.",
      });
      return;
    }
    if (resendCooldown > 0) return;
    form.clearErrors("root");
    setSuccess(null);
    setResendLoading(true);
    try {
      const data = await resendVerificationCode(email);
      setSuccess("A new verification code has been sent.");
      const nextIn =
        data.nextResendInSeconds ??
        (data.resendAt
          ? Math.max(0, data.resendAt - Math.floor(Date.now() / 1000))
          : null);
      setResendCooldown(nextIn ?? RESEND_COOLDOWN_SEC);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to resend code.";
      const msg = withRequestId(raw, err);
      if (
        raw.toLowerCase().includes("expired") ||
        raw.toLowerCase().includes("code")
      ) {
        form.setError("root", {
          type: "server",
          message: withRequestId("Code expired. Request a new one.", err),
        });
      } else {
        form.setError("root", { type: "server", message: msg });
      }
    } finally {
      setResendLoading(false);
    }
  }

  const hasStoredEmail =
    typeof sessionStorage !== "undefined" &&
    (sessionStorage.getItem(PENDING_VERIFY_KEY) ?? "").trim().length > 0;
  const missingEmail = !email.trim() && !hasStoredEmail;

  const hasEmail = email.trim().length > 0;
  const codeWatch = form.watch("code");
  const canSubmit = hasEmail && Boolean(codeWatch?.trim()) && !loading;
  const canResend = hasEmail && resendCooldown === 0 && !resendLoading;

  return (
    <>
      <PageMeta
        title={`Verify email | ${COMPANY_NAME}`}
        description={`Verify your ${COMPANY_NAME} account email.`}
        path={VERIFY_EMAIL_PATH}
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
              <VerifyEmailWelcomePanel />
              <VerifyEmailFormCard
                form={form}
                email={email}
                loading={loading}
                resendLoading={resendLoading}
                success={success}
                resendCooldown={resendCooldown}
                canSubmit={canSubmit}
                canResend={canResend}
                missingEmail={missingEmail}
                onSubmit={onSubmit}
                onResend={handleResend}
              />
            </div>
            <VerifyEmailHelpStrip />
          </div>
        </div>
      </div>
    </>
  );
}
