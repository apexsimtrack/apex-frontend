import type { UseFormReturn } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormRootMessage,
} from "@/components/ui/form";
import type { WithRootError } from "@/lib/formWithRootError";
import type { LoginFormValues } from "@/lib/validation/authPages";
import { withRequestId } from "@/lib/api/errors";
import {
  appInputClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";

const formLabelClassName =
  "font-apex-body text-[10px] uppercase text-apex-on-surface-variant";

const sectionEyebrowClassName =
  "font-apex-headline text-[10px] font-semibold uppercase tracking-[0.2em] text-apex-on-surface-variant";

const formCardClassName =
  "rounded-xl border border-apex-outline-variant/15 bg-gradient-to-b from-apex-surface-container to-apex-background p-6 sm:p-8";

type LoginFormCardProps = {
  form: UseFormReturn<WithRootError<LoginFormValues>>;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
  loading: boolean;
  emailVerifiedMessage: boolean;
  authRedirectMessage?: string;
  emailNotVerified: boolean;
  suspendedReason: string | null | undefined;
  suspendedLoginError?: unknown;
};

export default function LoginFormCard({
  form,
  onSubmit,
  loading,
  emailVerifiedMessage,
  authRedirectMessage,
  emailNotVerified,
  suspendedReason,
  suspendedLoginError,
}: LoginFormCardProps) {
  const navigate = useNavigate();

  return (
    <div className={formCardClassName}>
      <div className="mb-6 flex flex-col items-center text-center">
        <div
          className="mb-4 flex size-10 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary lg:hidden"
          aria-hidden
        >
          <LogIn className="size-5" />
        </div>
        <p className={cn(sectionEyebrowClassName, "lg:hidden")}>
          Account access
        </p>
        <h2 className="mt-2 font-apex-headline text-lg font-semibold text-apex-on-surface lg:mt-0">
          Sign in
        </h2>
      </div>

      {emailVerifiedMessage && (
        <div
          className="mb-6 flex gap-3 rounded-apex-lg border border-apex-success/30 bg-apex-success/10 p-5"
          role="status"
        >
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-apex-success"
            aria-hidden
          />
          <div>
            <p className="font-apex-headline font-medium text-apex-success">
              Email verified
            </p>
            <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
              You can sign in now.
            </p>
          </div>
        </div>
      )}

      {authRedirectMessage && (
        <p
          className="mb-6 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-4 py-3 font-apex-body text-sm text-apex-on-surface-variant"
          role="status"
        >
          {authRedirectMessage}
        </p>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
          aria-busy={loading || undefined}
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <label className={formLabelClassName}>Email</label>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={loading}
                    className={appInputClassName}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <label className={formLabelClassName}>Password</label>
                <FormControl>
                  <PasswordInput
                    autoComplete="current-password"
                    placeholder="Your password"
                    disabled={loading}
                    className={appInputClassName}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormRootMessage className="text-xs text-apex-error" />

          {suspendedReason !== undefined && (
            <div
              className="rounded-apex-lg border border-apex-error/30 bg-apex-error/10 p-5"
              role="alert"
            >
              <p className="font-apex-headline font-medium text-apex-error">
                {withRequestId(
                  "Your account has been suspended from this platform.",
                  suspendedLoginError,
                )}
              </p>
              {suspendedReason ? (
                <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
                  <span className="text-apex-on-surface-variant/70">
                    Reason:{" "}
                  </span>
                  {suspendedReason}
                </p>
              ) : null}
              <p className="mt-3 font-apex-body text-sm text-apex-on-surface-variant">
                If you believe this is a mistake, please visit our{" "}
                <Link
                  to="/contact"
                  className="text-apex-primary transition-colors hover:text-apex-primary/80"
                >
                  contact page
                </Link>{" "}
                and reach out to the team.
              </p>
            </div>
          )}

          {emailNotVerified && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const e = form.getValues("email").trim();
                  if (e) sessionStorage.setItem("apex_verify_email", e);
                  navigate("/verify-email", { state: { email: e } });
                }}
                className="text-left font-apex-body text-sm text-apex-primary transition-colors hover:text-apex-primary/80"
              >
                Go to verification
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              className="font-apex-body text-sm text-apex-on-surface transition-colors hover:text-apex-on-surface/80"
            >
              Forgot password?
            </button>
          </div>

          <Button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className={cn("w-full", appPrimaryButtonClassName)}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          <p className="text-center font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            By signing in, you agree to our{" "}
            <Link
              to="/terms-and-conditions"
              className="text-apex-primary transition-colors hover:text-apex-primary/80"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              to="/privacy-policy"
              className="text-apex-primary transition-colors hover:text-apex-primary/80"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </Form>
    </div>
  );
}
