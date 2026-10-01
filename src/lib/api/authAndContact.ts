import { getOrCreateDeviceId } from "@/auth/deviceId";
import {
  buildApiAuthHeaders,
  fetchApi,
  notifyAuthExpired,
} from "./fetchClient";
import { API_BASE } from "./config";
import { ApiError } from "./errors";
import { responseRequestId } from "./requestId";
import type { SessionVisibility, InAppNotificationPrefs } from "./profile";
import type { BillingStore } from "./activityBilling";

// Auth — backend may return { id, email, displayName? } at top level (no user wrapper)
export type AuthUser = {
  id: string;
  email: string;
  /** Server-backed; omitted on older API responses. */
  role?: "USER" | "ADMIN";
  displayName?: string;
  name?: string;
  hasPro?: boolean;
  /** True when a historical or current Subscription row exists. */
  hasSubscriptionHistory?: boolean;
  /** Paid subscription Pro (not beta-trial-only). Prefer over inferring from hasPro. */
  hasPaidPro?: boolean;
  /** Active billing cashiers for this entitlement; do not infer from device. */
  billingStores?: BillingStore[];
  effectivePlan?: "FREE" | "PRO";
  billingInterval?: "MONTHLY" | "ANNUAL" | null;
  planDisplayName?: string | null;
  subscriptionStatus?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  /** Beta cohort; may remain true after trial ends. */
  isBetaUser?: boolean;
  betaTrialStartedAt?: string | null;
  betaTrialExpiresAt?: string | null;
  hasSeenBetaWelcomeModal?: boolean;
  betaAccessNoticeType?:
    | "WELCOME"
    | "GRANTED"
    | "EXTENDED"
    | "RESTORED"
    | "UPDATED"
    | null;
  betaAccessPreviousExpiresAt?: string | null;
  /** Automatic 10-day Pro trial started on first successful email verification. */
  signupTrialStartedAt?: string | null;
  signupTrialExpiresAt?: string | null;
  hasSeenSignupTrialWelcomeModal?: boolean;
  avatarUrl?: string | null;
  tagline?: string | null;
  bio?: string | null;
  emailVerified?: boolean;
  /** Server-backed privacy flags (also in local ApexSettings for offline prefs). */
  privateProfile?: boolean;
  manualFollowApproval?: boolean;
  sessionVisibility?: SessionVisibility;
  /** Optional/product email; auth emails always send. */
  emailNotifications?: boolean;
  /** Navbar unread badge; notifications panel still works when false. */
  showNotificationBadge?: boolean;
  inAppNotificationPrefs?: InAppNotificationPrefs;
};

/** Body for PATCH /api/auth/me. Backend may use "bio" or "tagline"; we send both so either works. */
export type UpdateMeBody = {
  displayName: string;
  avatarUrl?: string | null;
  tagline?: string | null;
  bio?: string | null;
};

// Refresh on 401 is handled in fetchApi; skipAuthExpiredCheck is false so a stale
// JWT can rotate via refresh on boot instead of appearing logged out.
export async function authMe(): Promise<AuthUser> {
  const data = await fetchApi<AuthUser | { user?: AuthUser }>(
    "GET",
    "/api/auth/me",
    undefined,
    false,
  );
  const user = (data as { user?: AuthUser }).user ?? (data as AuthUser);
  return user;
}

/** PATCH /api/auth/me — update current user (displayName, optional avatarUrl/tagline). Returns updated user. */
export async function updateMe(body: UpdateMeBody): Promise<AuthUser> {
  const data = await fetchApi<AuthUser | { user?: AuthUser }>(
    "PATCH",
    "/api/auth/me",
    body,
    true,
  );
  const user = (data as { user?: AuthUser }).user ?? (data as AuthUser);
  return user;
}

/** POST /api/auth/me/beta-welcome — mark beta welcome modal as seen. Returns updated user. */
export async function dismissBetaWelcome(): Promise<AuthUser> {
  return dismissComplimentaryWelcome();
}

/** Mark any active automatic/admin complimentary welcome notices as seen. */
export async function dismissComplimentaryWelcome(): Promise<AuthUser> {
  const data = await fetchApi<AuthUser | { user?: AuthUser }>(
    "POST",
    "/api/auth/me/beta-welcome",
    undefined,
    true,
  );
  const user = (data as { user?: AuthUser }).user ?? (data as AuthUser);
  return user;
}

// Avatar upload – POST /api/profile/avatar with FormData (file field "avatar"). Uses fetch so we can send multipart; auth same as fetchApi.
export type UploadProfileAvatarResponse = { avatarUrl: string };

export async function uploadProfileAvatar(
  file: File,
): Promise<UploadProfileAvatarResponse> {
  const formData = new FormData();
  formData.append("avatar", file);

  const headers = buildApiAuthHeaders();
  const url = `${API_BASE}/api/profile/avatar`;

  const res = await fetch(url, {
    method: "POST",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: formData,
  });

  if (!res.ok) {
    let message = "Avatar upload failed";
    let body: unknown;
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text) as { message?: string; error?: string };
          body = json;
          message = json.message ?? json.error ?? message;
        } catch {
          message = text;
        }
      }
    } catch {
      // ignore parse error, keep default message
    }
    await notifyAuthExpired(false, res.status);
    throw new ApiError(
      res.status,
      message,
      undefined,
      undefined,
      responseRequestId(res.headers.get("x-request-id"), body),
    );
  }

  const data = (await res.json()) as UploadProfileAvatarResponse;
  if (!data?.avatarUrl) {
    throw new ApiError(
      500,
      "No avatar URL in response",
      undefined,
      undefined,
      responseRequestId(res.headers.get("x-request-id"), data),
    );
  }
  return data;
}

/** Response from POST /api/auth/register. Backend may return accessToken or token, or require email verification. */
export type RegisterResponse = {
  accessToken?: string;
  token?: string;
  user?: AuthUser;
  /** If true, user must verify email before being fully authenticated; do not store token or redirect to profile. */
  requiresVerification?: boolean;
};

/** Response from POST /api/auth/verify-email. Backend may return token to auto-login or just success. */
export type VerifyEmailResponse = {
  success?: boolean;
  accessToken?: string;
  token?: string;
  /** Server AuthSession id — pair with JWT for admin session list / revoke */
  sessionToken?: string;
  /** Opaque refresh for silent access renewal (optional until backend supports it). */
  refreshToken?: string;
  user?: AuthUser;
};

/** Response from POST /api/auth/resend-verification. Backend may return cooldown. */
export type ResendVerificationResponse = {
  ok?: boolean;
  success?: boolean;
  /** Unix timestamp (seconds) when next resend is allowed; frontend can show cooldown. */
  resendAt?: number;
  /** Alternative: seconds until next resend allowed. */
  nextResendInSeconds?: number;
};

// Forgot password / reset password flows

export type ForgotPasswordResponse = {
  ok?: boolean;
  success?: boolean;
};

export type VerifyResetCodeResponse = {
  ok?: boolean;
  success?: boolean;
};

export type ResetPasswordResponse = {
  ok?: boolean;
  success?: boolean;
};

/** POST /api/auth/register — single register endpoint. Body: { name, email, password }. */
export async function authRegister(
  email: string,
  password: string,
  name?: string,
): Promise<RegisterResponse> {
  return fetchApi<RegisterResponse>(
    "POST",
    "/api/auth/register",
    {
      name: name?.trim() || undefined,
      email,
      password,
    },
    true,
  );
}

/** POST /api/auth/forgot-password — request reset code via email. Body: { email }. */
export async function requestPasswordReset(
  email: string,
): Promise<ForgotPasswordResponse> {
  return fetchApi<ForgotPasswordResponse>(
    "POST",
    "/api/auth/forgot-password",
    {
      email: email.trim(),
    },
    true,
  );
}

/** POST /api/auth/verify-reset-code — verify reset code. Body: { email, code }. */
export async function verifyPasswordResetCode(
  email: string,
  code: string,
): Promise<VerifyResetCodeResponse> {
  return fetchApi<VerifyResetCodeResponse>(
    "POST",
    "/api/auth/verify-reset-code",
    {
      email: email.trim(),
      code: String(code).trim(),
    },
    true,
  );
}

/** POST /api/auth/reset-password — reset password. Body: { email, code, password }. */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  password: string,
): Promise<ResetPasswordResponse> {
  return fetchApi<ResetPasswordResponse>(
    "POST",
    "/api/auth/reset-password",
    {
      email: email.trim(),
      code: String(code).trim(),
      password,
    },
    true,
  );
}

/** POST /api/auth/verify-email — submit verification code. Body: { email, code }. Returns token if backend auto-completes auth. */
export async function verifyEmail(
  email: string,
  code: string,
): Promise<VerifyEmailResponse> {
  const clientDeviceId = getOrCreateDeviceId();
  return fetchApi<VerifyEmailResponse>(
    "POST",
    "/api/auth/verify-email",
    {
      email: email.trim(),
      code: String(code).trim(),
      ...(clientDeviceId ? { clientDeviceId } : {}),
    },
    true,
  );
}

/** POST /api/auth/resend-verification-code — request new code. Body: { email }. */
export async function resendVerificationCode(
  email: string,
): Promise<ResendVerificationResponse> {
  return fetchApi<ResendVerificationResponse>(
    "POST",
    "/api/auth/resend-verification-code",
    {
      email: email.trim(),
    },
    true,
  );
}

/** POST /api/contact — public contact form; emails support inbox. */
export type ContactPayload = {
  name: string;
  email: string;
  subject?: string;
  message: string;
};

export type ContactResponse = {
  ok: true;
};

export async function submitContact(
  body: ContactPayload,
): Promise<ContactResponse> {
  return fetchApi<ContactResponse>(
    "POST",
    "/api/contact",
    {
      name: body.name.trim(),
      email: body.email.trim(),
      ...(body.subject != null && body.subject.trim() !== ""
        ? { subject: body.subject.trim() }
        : {}),
      message: body.message.trim(),
    },
    true,
  );
}

export type LoginResponse = {
  token: string;
  sessionToken?: string;
  accessToken?: string;
  refreshToken?: string;
};

export async function authLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const clientDeviceId = getOrCreateDeviceId();
  return fetchApi<LoginResponse>(
    "POST",
    "/api/auth/login",
    {
      email,
      password,
      ...(clientDeviceId ? { clientDeviceId } : {}),
    },
    true,
  );
}

export async function authLogout(): Promise<void> {
  await fetchApi<{ ok?: boolean }>("POST", "/api/auth/logout", undefined, true);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok?: boolean }> {
  return fetchApi<{ ok?: boolean }>("POST", "/api/settings/change-password", {
    currentPassword,
    newPassword,
  });
}

export async function deleteAccount(
  password: string,
): Promise<{ ok?: boolean }> {
  return fetchApi<{ ok?: boolean }>(
    "DELETE",
    "/api/settings/account",
    { password },
    true,
  );
}
