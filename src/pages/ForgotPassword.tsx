import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPasswordWithCode,
  ApiError,
  withRequestId,
} from "@/lib/api";
import type { WithRootError } from "@/lib/formWithRootError";
import {
  forgotEmailFormSchema,
  forgotCodeFormSchema,
  forgotResetFormSchema,
  type ForgotEmailFormValues,
  type ForgotCodeFormValues,
  type ForgotResetFormValues,
} from "@/lib/validation/authPages";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import ForgotPasswordWelcomePanel from "./forgot-password/ForgotPasswordWelcomePanel";
import ForgotPasswordFormCard, {
  type ForgotPasswordStep,
} from "./forgot-password/ForgotPasswordFormCard";
import ForgotPasswordHelpStrip from "./forgot-password/ForgotPasswordHelpStrip";

const FORGOT_PASSWORD_PATH = "/forgot-password";

export default function ForgotPassword() {
  const [step, setStep] = useState<ForgotPasswordStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const emailForm = useForm<WithRootError<ForgotEmailFormValues>>({
    resolver: zodResolver(forgotEmailFormSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<WithRootError<ForgotCodeFormValues>>({
    resolver: zodResolver(forgotCodeFormSchema),
    defaultValues: { code: "" },
  });
  const resetForm = useForm<WithRootError<ForgotResetFormValues>>({
    resolver: zodResolver(forgotResetFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (step === "email") {
      emailForm.reset({ email });
    }
  }, [step, email, emailForm]);

  useEffect(() => {
    if (step === "code") {
      codeForm.reset({ code });
    }
  }, [step, code, codeForm]);

  useEffect(() => {
    if (step === "reset") {
      resetForm.reset({ password: "", confirmPassword: "" });
    }
  }, [step, resetForm]);

  const trimmedEmail = email.trim();

  async function handleEmailSubmit(trimmed: string) {
    emailForm.clearErrors("root");
    setSuccess(null);
    setLoading(true);
    try {
      await requestPasswordReset(trimmed);
      setEmail(trimmed);
      setSuccess("We sent a verification code to your email.");
      setStep("code");
    } catch (err) {
      emailForm.setError("root", {
        type: "server",
        message: withRequestId(
          err instanceof Error ? err.message : "Failed to request reset.",
          err,
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(trimmedCode: string) {
    codeForm.clearErrors("root");
    setSuccess(null);
    if (!trimmedEmail) {
      codeForm.setError("root", {
        type: "server",
        message: "Email is missing. Go back and enter it again.",
      });
      return;
    }
    setLoading(true);
    try {
      await verifyPasswordResetCode(trimmedEmail, trimmedCode);
      setCode(trimmedCode);
      setStep("reset");
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESET_CODE_INVALID") {
        codeForm.setError("root", {
          type: "server",
          message: withRequestId(
            "That code is invalid. Check the email and try again.",
            err,
          ),
        });
      } else if (err instanceof ApiError && err.code === "RESET_CODE_EXPIRED") {
        codeForm.setError("root", {
          type: "server",
          message: withRequestId(
            "That code has expired. Request a new one.",
            err,
          ),
        });
      } else {
        codeForm.setError("root", {
          type: "server",
          message: withRequestId(
            err instanceof Error ? err.message : "Verification failed.",
            err,
          ),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResetSubmit(password: string) {
    resetForm.clearErrors("root");
    setSuccess(null);
    if (!trimmedEmail) {
      resetForm.setError("root", {
        type: "server",
        message: "Email is missing. Go back and enter it again.",
      });
      return;
    }
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      resetForm.setError("root", {
        type: "server",
        message: "Reset code is missing. Go back and enter it again.",
      });
      return;
    }
    setLoading(true);
    try {
      await resetPasswordWithCode(trimmedEmail, trimmedCode, password);
      setSuccess("Your password has been reset. You can now sign in.");
      setStep("done");
    } catch (err) {
      resetForm.setError("root", {
        type: "server",
        message: withRequestId(
          err instanceof Error ? err.message : "Failed to reset password.",
          err,
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (!trimmedEmail) {
      codeForm.setError("root", {
        type: "server",
        message: "Email is missing. Go back and enter it again.",
      });
      return;
    }
    codeForm.clearErrors("root");
    setSuccess(null);
    setLoading(true);
    try {
      await requestPasswordReset(trimmedEmail);
      setSuccess("We sent a new verification code to your email.");
    } catch (err) {
      codeForm.setError("root", {
        type: "server",
        message: withRequestId(
          err instanceof Error ? err.message : "Failed to resend code.",
          err,
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  function handleBackToEmail() {
    setStep("email");
    codeForm.clearErrors("root");
    emailForm.clearErrors("root");
    setSuccess(null);
  }

  return (
    <>
      <PageMeta
        title={`Reset password | ${COMPANY_NAME}`}
        description={`Reset your ${COMPANY_NAME} account password.`}
        path={FORGOT_PASSWORD_PATH}
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
              <ForgotPasswordWelcomePanel />
              <ForgotPasswordFormCard
                step={step}
                emailForm={emailForm}
                codeForm={codeForm}
                resetForm={resetForm}
                emailDisplay={trimmedEmail}
                loading={loading}
                success={success}
                onEmailSubmit={handleEmailSubmit}
                onCodeSubmit={handleCodeSubmit}
                onResetSubmit={handleResetSubmit}
                onBackToEmail={handleBackToEmail}
                onResendCode={handleResendCode}
              />
            </div>
            <ForgotPasswordHelpStrip />
          </div>
        </div>
      </div>
    </>
  );
}
