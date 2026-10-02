import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { AUTH_PATHS } from "@/config/navigation";
import { useAuth, AUTH_ME_QUERY_KEY } from "@/contexts/AuthContext";
import { clearToken } from "@/auth/token";
import { withRequestId,
  authLogout,
  changePassword,
  deleteAccount,
  requestUserDataExport,
  fetchLatestUserDataExport,
  openDataExportDownload,
  ApiError,
  patchPrivacySettings,
  patchNotificationSettings,
  type DataExportDepth,
  type DataExportJob,
  type SessionVisibility,
} from "@/lib/api";
import {
  getApexSettings,
  type ApexSettings,
  DEFAULT_IN_APP_NOTIFICATION_PREFS,
} from "@/lib/settingsStorage";
import type { InAppNotificationPrefs } from "@/lib/api";
import {
  settingsTitle,
  settingsDescription,
  PRIMARY_RED,
  DELETE_CONFIRM_PHRASE,
  SESSION_VISIBILITY_OPTIONS,
} from "@/features/settings/constants";
import { formatRetryAfterMs } from "@/features/settings/utils";
import { useSettingsForms } from "@/features/settings/hooks/useSettingsForms";
import {
  useApexFromServerUserEffect,
  useDeleteAccountFormOnDialogEffect,
  useAccountFormResetEffect,
  usePersistApexToStorageEffect,
} from "@/features/settings/hooks/useSettingsUserEffects";
import { useAvatarFileSelection } from "@/features/profile/useAvatarFileSelection";
import { saveProfileIdentity } from "@/features/profile/saveProfileIdentity";
import { Button } from "@/components/ui/button";
import {
  type SettingsAccountFormValues,
  type SettingsChangePasswordValues,
  type DeleteAccountFormValues,
  settingsAccountFormSchema,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from "@/lib/validation/settingsForms";
import { appPrimaryButtonClassName } from "@/components/app-ui/appButtonClasses";
import PageMeta from "@/components/PageMeta";
import SettingsPageSkeleton from "./settings/SettingsPageSkeleton";
import SettingsAccountSection from "./settings/SettingsAccountSection";
import SettingsPrivacySection from "./settings/SettingsPrivacySection";
import SettingsDeleteDialog from "./settings/SettingsDeleteDialog";
import SettingsPasswordSection from "./settings/SettingsPasswordSection";
import SettingsNotificationsSection from "./settings/SettingsNotificationsSection";
import SettingsAccountActionsSection from "./settings/SettingsAccountActionsSection";
import SettingsImpersonationSection from "./settings/SettingsImpersonationSection";
import SettingsWeeklyGoalsSection from "./settings/SettingsWeeklyGoalsSection";
import BlockedUsersModal, {
  SettingsBlockedUsersSection,
} from "./settings/SettingsBlockedUsersSection";
import HiddenContentModal, {
  SettingsHiddenContentSection,
} from "./settings/SettingsHiddenContentSection";
import { SettingsSectionChrome } from "./settings/SettingsSectionChrome";
import { SubscriptionCard } from "./settings/SubscriptionCard";

const SETTINGS_PATH = "/settings";
const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function isInFlightExport(job: DataExportJob | null | undefined): boolean {
  return job?.status === "pending" || job?.status === "processing";
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading, setUser, refreshMe } = useAuth();

  const [settings, setSettings] = useState<ApexSettings>(() =>
    getApexSettings(),
  );
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountSuccess, setAccountSuccess] = useState(false);
  const accountSaveInFlightRef = useRef(false);
  const [changePwSubmitting, setChangePwSubmitting] = useState(false);
  const [changePwSuccess, setChangePwSuccess] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [exportRequesting, setExportRequesting] = useState(false);
  const [exportPolling, setExportPolling] = useState(false);
  const [exportDepth, setExportDepth] = useState<DataExportDepth>("summary");
  const [exportJob, setExportJob] = useState<DataExportJob | null>(null);
  const [cooldownMs, setCooldownMs] = useState<number | null>(null);
  const exportPollRef = useRef<number | null>(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [hiddenContentOpen, setHiddenContentOpen] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);

  const { accountForm, changePasswordForm, deleteAccountForm } =
    useSettingsForms(DELETE_CONFIRM_PHRASE);
  const {
    avatarFile,
    avatarPreview,
    avatarError,
    avatarInputRef,
    handleAvatarFileChange,
    clearAvatarSelection,
  } = useAvatarFileSelection();

  useAccountFormResetEffect(user, accountForm);
  useApexFromServerUserEffect(user, setSettings);
  useDeleteAccountFormOnDialogEffect(deleteDialogOpen, deleteAccountForm);

  const currentDisplayName = user?.displayName ?? user?.email ?? "";
  const currentBio = user?.bio?.trim() ?? user?.tagline?.trim() ?? "";
  const displayNameWatch = accountForm.watch("displayName");
  const taglineWatch = accountForm.watch("tagline");
  const trimmedDisplayName = displayNameWatch.trim();
  const trimmedBio = taglineWatch.trim();
  const accountChanged =
    trimmedDisplayName !== currentDisplayName ||
    trimmedBio !== currentBio ||
    Boolean(avatarFile);
  const accountValid = settingsAccountFormSchema.safeParse({
    displayName: displayNameWatch,
    tagline: taglineWatch,
  }).success;
  const saveAccountDisabled =
    !accountValid || !accountChanged || savingAccount || Boolean(avatarError);

  const onSaveAccount = useCallback(
    async (values: SettingsAccountFormValues) => {
      if (!user || accountSaveInFlightRef.current || savingAccount) return;
      if (!accountChanged && !avatarFile) return;
      accountSaveInFlightRef.current = true;
      setAccountSuccess(false);
      setSavingAccount(true);
      try {
        const ok = await saveProfileIdentity({
          user,
          values,
          avatarFile,
          avatarError,
          form: accountForm,
          queryClient,
          setUser,
          refreshMe,
        });
        if (!ok) return;
        clearAvatarSelection();
        setAccountSuccess(true);
        setTimeout(() => setAccountSuccess(false), 2000);
      } finally {
        setSavingAccount(false);
        accountSaveInFlightRef.current = false;
      }
    },
    [
      user,
      savingAccount,
      accountChanged,
      avatarFile,
      avatarError,
      accountForm,
      queryClient,
      setUser,
      refreshMe,
      clearAvatarSelection,
    ],
  );

  usePersistApexToStorageEffect(settings);

  const applyNotificationSettingsResponse = useCallback(
    (updated: {
      emailNotifications: boolean;
      showNotificationBadge: boolean;
      inAppNotificationPrefs: InAppNotificationPrefs;
    }) => {
      setSettings((s) => ({
        ...s,
        emailNotifications: updated.emailNotifications,
        showNotificationBadge: updated.showNotificationBadge,
        inAppNotificationPrefs: updated.inAppNotificationPrefs,
      }));
      if (user) {
        setUser({
          ...user,
          emailNotifications: updated.emailNotifications,
          showNotificationBadge: updated.showNotificationBadge,
          inAppNotificationPrefs: updated.inAppNotificationPrefs,
        });
      }
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        return {
          ...(old as Record<string, unknown>),
          emailNotifications: updated.emailNotifications,
          showNotificationBadge: updated.showNotificationBadge,
          inAppNotificationPrefs: updated.inAppNotificationPrefs,
        };
      });
    },
    [queryClient, setUser, user],
  );

  const applyNotificationToggle = useCallback(
    async (
      key: "emailNotifications" | "showNotificationBadge",
      value: boolean,
    ) => {
      const prev = settings[key];
      setSettings((s) => ({ ...s, [key]: value }));
      setNotificationSaving(true);
      try {
        const updated = await patchNotificationSettings({ [key]: value });
        applyNotificationSettingsResponse(updated);
      } catch (e) {
        setSettings((s) => ({ ...s, [key]: prev }));
        const msg =
          withRequestId(e instanceof Error ? e.message : "Could not save notification settings.", e);
        toast.error(msg);
      } finally {
        setNotificationSaving(false);
      }
    },
    [applyNotificationSettingsResponse, settings],
  );

  const applyInAppCategoryToggle = useCallback(
    async (key: keyof InAppNotificationPrefs, value: boolean) => {
      const prev = settings.inAppNotificationPrefs[key];
      setSettings((s) => ({
        ...s,
        inAppNotificationPrefs: { ...s.inAppNotificationPrefs, [key]: value },
      }));
      setNotificationSaving(true);
      try {
        const updated = await patchNotificationSettings({
          inAppNotificationPrefs: { [key]: value },
        });
        applyNotificationSettingsResponse(updated);
      } catch (e) {
        setSettings((s) => ({
          ...s,
          inAppNotificationPrefs: { ...s.inAppNotificationPrefs, [key]: prev },
        }));
        const msg =
          withRequestId(e instanceof Error ? e.message : "Could not save notification settings.", e);
        toast.error(msg);
      } finally {
        setNotificationSaving(false);
      }
    },
    [applyNotificationSettingsResponse, settings.inAppNotificationPrefs],
  );

  const handleResetNotificationDefaults = useCallback(async () => {
    setNotificationSaving(true);
    try {
      const updated = await patchNotificationSettings({
        emailNotifications: true,
        showNotificationBadge: true,
        inAppNotificationPrefs: { ...DEFAULT_IN_APP_NOTIFICATION_PREFS },
      });
      applyNotificationSettingsResponse(updated);
    } catch (e) {
      const msg =
        withRequestId(e instanceof Error ? e.message : "Could not reset notification settings.", e);
      toast.error(msg);
    } finally {
      setNotificationSaving(false);
    }
  }, [applyNotificationSettingsResponse]);

  const applyPrivacyToggle = useCallback(
    async (key: "privateProfile" | "manualFollowApproval", value: boolean) => {
      const prev = settings[key];
      setSettings((s) => ({ ...s, [key]: value }));
      setPrivacySaving(true);
      try {
        const updated = await patchPrivacySettings({ [key]: value });
        setSettings((s) => ({ ...s, ...updated }));
        if (user) {
          setUser({
            ...user,
            privateProfile: updated.privateProfile,
            manualFollowApproval: updated.manualFollowApproval,
            sessionVisibility: updated.sessionVisibility,
          });
        }
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          return {
            ...(old as Record<string, unknown>),
            privateProfile: updated.privateProfile,
            manualFollowApproval: updated.manualFollowApproval,
            sessionVisibility: updated.sessionVisibility,
          };
        });
      } catch (e) {
        setSettings((s) => ({ ...s, [key]: prev }));
        const msg =
          withRequestId(e instanceof Error ? e.message : "Could not save privacy settings.", e);
        toast.error(msg);
      } finally {
        setPrivacySaving(false);
      }
    },
    [queryClient, setUser, settings, user],
  );

  const applySessionVisibility = useCallback(
    async (value: SessionVisibility) => {
      const prev = settings.sessionVisibility;
      setSettings((s) => ({ ...s, sessionVisibility: value }));
      setPrivacySaving(true);
      try {
        const updated = await patchPrivacySettings({
          sessionVisibility: value,
        });
        setSettings((s) => ({ ...s, ...updated }));
        if (user) {
          setUser({
            ...user,
            privateProfile: updated.privateProfile,
            manualFollowApproval: updated.manualFollowApproval,
            sessionVisibility: updated.sessionVisibility,
          });
        }
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          return {
            ...(old as Record<string, unknown>),
            privateProfile: updated.privateProfile,
            manualFollowApproval: updated.manualFollowApproval,
            sessionVisibility: updated.sessionVisibility,
          };
        });
      } catch (e) {
        setSettings((s) => ({ ...s, sessionVisibility: prev }));
        const msg =
          withRequestId(e instanceof Error ? e.message : "Could not save privacy settings.", e);
        toast.error(msg);
      } finally {
        setPrivacySaving(false);
      }
    },
    [queryClient, setUser, settings.sessionVisibility, user],
  );

  const handleLogout = useCallback(async () => {
    try {
      await authLogout();
    } catch {
      // Server revoke is best-effort; always clear local credentials.
    }
    await clearToken();
    navigate(AUTH_PATHS.login, { replace: true });
  }, [navigate]);

  const syncCooldownFromJob = useCallback((job: DataExportJob | null) => {
    if (!job) {
      setCooldownMs(null);
      return;
    }
    const remaining =
      new Date(job.requestedAt).getTime() + EXPORT_COOLDOWN_MS - Date.now();
    setCooldownMs(remaining > 0 ? remaining : null);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const job = await fetchLatestUserDataExport();
        if (cancelled) return;
        setExportJob(job);
        syncCooldownFromJob(job);
      } catch {
        /* ignore hydrate errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, syncCooldownFromJob]);

  useEffect(() => {
    if (!isInFlightExport(exportJob)) {
      setExportPolling(false);
      if (exportPollRef.current != null) {
        window.clearInterval(exportPollRef.current);
        exportPollRef.current = null;
      }
      return;
    }
    setExportPolling(true);
    const poll = async () => {
      try {
        const latest = await fetchLatestUserDataExport();
        setExportJob(latest);
        syncCooldownFromJob(latest);
        if (!isInFlightExport(latest)) {
          if (latest?.status === "ready") {
            toast.success("Your data export is ready to download.");
          } else if (latest?.status === "failed") {
            toast.error(latest.error?.message ?? "Export failed.");
          }
        }
      } catch {
        /* keep polling */
      }
    };
    void poll();
    exportPollRef.current = window.setInterval(() => void poll(), 3000);
    return () => {
      if (exportPollRef.current != null) {
        window.clearInterval(exportPollRef.current);
        exportPollRef.current = null;
      }
    };
  }, [exportJob?.id, exportJob?.status, syncCooldownFromJob]);

  useEffect(() => {
    if (cooldownMs == null || cooldownMs <= 0) return;
    const id = window.setInterval(() => {
      setCooldownMs((prev) => {
        if (prev == null) return null;
        const next = prev - 30_000;
        return next > 0 ? next : null;
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [cooldownMs]);

  const handleRequestExport = useCallback(async () => {
    if (exportRequesting || isInFlightExport(exportJob)) return;
    setExportRequesting(true);
    try {
      const job = await requestUserDataExport({ depth: exportDepth });
      setExportJob(job);
      syncCooldownFromJob(job);
      toast.success("Export requested. We’ll prepare your download.");
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 429 && e.retryAfterMs != null
          ? withRequestId(`You can export again in ${formatRetryAfterMs(e.retryAfterMs)}.`, e)
          : withRequestId(e instanceof Error ? e.message : "Could not request export.", e);
      if (e instanceof ApiError && e.status === 429 && e.retryAfterMs != null) {
        setCooldownMs(e.retryAfterMs);
      }
      toast.error(msg);
    } finally {
      setExportRequesting(false);
    }
  }, [exportDepth, exportJob, exportRequesting, syncCooldownFromJob]);

  const handleDownloadExport = useCallback(() => {
    if (!exportJob?.downloadUrl) return;
    try {
      openDataExportDownload(exportJob);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start download.");
    }
  }, [exportJob]);

  const resetDeleteDialog = useCallback(() => {
    deleteAccountForm.reset({ password: "", confirmPhrase: "" });
    deleteAccountForm.clearErrors("root");
  }, [deleteAccountForm]);

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      setDeleteDialogOpen(open);
      if (!open) resetDeleteDialog();
    },
    [resetDeleteDialog],
  );

  const onConfirmDeleteAccount = useCallback(
    async (values: DeleteAccountFormValues) => {
      if (deleteSubmitting) return;
      deleteAccountForm.clearErrors("root");
      setDeleteSubmitting(true);
      try {
        await deleteAccount(values.password);
        await clearToken();
        setUser(null);
        setDeleteDialogOpen(false);
        resetDeleteDialog();
        navigate(AUTH_PATHS.login, { replace: true });
      } catch (e) {
        const msg =
          withRequestId(e instanceof Error ? e.message : "Could not delete account.", e);
        deleteAccountForm.setError("root", { type: "server", message: msg });
      } finally {
        setDeleteSubmitting(false);
      }
    },
    [deleteAccountForm, deleteSubmitting, navigate, resetDeleteDialog, setUser],
  );

  const changePwWatch = changePasswordForm.watch();
  const trimmedNewPw = changePwWatch.newPassword?.trim() ?? "";
  const currentPasswordValid = (changePwWatch.currentPassword?.length ?? 0) > 0;
  const newPasswordValid =
    trimmedNewPw.length >= PASSWORD_MIN && trimmedNewPw.length <= PASSWORD_MAX;
  const newPasswordTooLong = trimmedNewPw.length > PASSWORD_MAX;
  const passwordsSameAsCurrent =
    changePwWatch.currentPassword?.trim() === trimmedNewPw &&
    trimmedNewPw.length > 0;
  const updatePasswordDisabled =
    !currentPasswordValid ||
    !newPasswordValid ||
    passwordsSameAsCurrent ||
    changePwSubmitting;

  const onChangePassword = useCallback(
    async (values: SettingsChangePasswordValues) => {
      if (changePwSubmitting) return;
      const trimmedNew = values.newPassword.trim();
      changePasswordForm.clearErrors("root");
      setChangePwSuccess(false);
      setChangePwSubmitting(true);
      try {
        await changePassword(values.currentPassword, trimmedNew);
        changePasswordForm.reset({ currentPassword: "", newPassword: "" });
        setChangePwSuccess(true);
        setTimeout(() => setChangePwSuccess(false), 2500);
      } catch (e) {
        const msg =
          withRequestId(e instanceof Error ? e.message : "Could not update password.", e);
        changePasswordForm.setError("root", { type: "server", message: msg });
      } finally {
        setChangePwSubmitting(false);
      }
    },
    [changePasswordForm, changePwSubmitting],
  );

  const handlePasswordFieldChange = useCallback(() => {
    changePasswordForm.clearErrors("root");
    setChangePwSuccess(false);
  }, [changePasswordForm]);

  const handleManageFollowRequests = useCallback(() => {
    window.dispatchEvent(new CustomEvent("apex:open-notifications"));
  }, []);

  if (loading) {
    return (
      <>
        <PageMeta
          title={settingsTitle}
          description={settingsDescription}
          path={SETTINGS_PATH}
          noindex
        />
        <SettingsPageSkeleton />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PageMeta
          title={settingsTitle}
          description={settingsDescription}
          path={SETTINGS_PATH}
          noindex
        />
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm rounded-apex-lg bg-apex-surface-container-low p-6 text-center">
            <p className="mb-2 font-apex-headline font-bold text-apex-on-surface">
              Not signed in
            </p>
            <p className="mb-4 text-sm text-apex-on-surface-variant">
              Sign in to manage your settings.
            </p>
            <Button
              type="button"
              onClick={() => navigate(AUTH_PATHS.login, { replace: true })}
              className={appPrimaryButtonClassName}
              style={{ backgroundColor: PRIMARY_RED }}
            >
              Log in
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={settingsTitle}
        description={settingsDescription}
        path={SETTINGS_PATH}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <div className="mb-10">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Driver Settings
          </h1>
          <p className="mt-2 text-sm tracking-wide text-apex-on-surface-variant">
            Configure your kinetic profile and telemetry preferences
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-10 lg:col-span-7">
            <SettingsAccountSection
              user={user}
              accountForm={accountForm}
              onSaveAccount={onSaveAccount}
              saveDisabled={saveAccountDisabled}
              saving={savingAccount}
              success={accountSuccess}
              avatarInputRef={avatarInputRef}
              avatarPreview={avatarPreview}
              avatarError={avatarError}
              onAvatarFileChange={handleAvatarFileChange}
              onClearAvatarSelection={clearAvatarSelection}
            >
              <SettingsPasswordSection
                changePasswordForm={changePasswordForm}
                onChangePassword={onChangePassword}
                changePwWatch={changePwWatch}
                trimmedNewPw={trimmedNewPw}
                currentPasswordValid={currentPasswordValid}
                newPasswordValid={newPasswordValid}
                newPasswordTooLong={newPasswordTooLong}
                passwordsSameAsCurrent={passwordsSameAsCurrent}
                updatePasswordDisabled={updatePasswordDisabled}
                changePwSubmitting={changePwSubmitting}
                changePwSuccess={changePwSuccess}
                onFieldChange={handlePasswordFieldChange}
              />
            </SettingsAccountSection>

            <SettingsPrivacySection
              settings={settings}
              privacySaving={privacySaving}
              applyPrivacyToggle={applyPrivacyToggle}
              applySessionVisibility={applySessionVisibility}
              sessionVisibilityOptions={SESSION_VISIBILITY_OPTIONS}
              onManageFollowRequests={handleManageFollowRequests}
            />

            <SettingsNotificationsSection
              settings={settings}
              notificationSaving={notificationSaving}
              applyNotificationToggle={applyNotificationToggle}
              applyInAppCategoryToggle={applyInAppCategoryToggle}
              onResetDefaults={handleResetNotificationDefaults}
            />
          </div>

          <div className="space-y-10 lg:col-span-5">
            <SettingsSectionChrome title="Subscription">
              <SubscriptionCard />
            </SettingsSectionChrome>

            <SettingsSectionChrome title="Blocked users">
              <p className="mb-4 font-apex-body text-sm text-apex-on-surface-variant">
                Hidden people no longer appear in your community, comments, or activity feed.
              </p>
              <SettingsBlockedUsersSection
                onManage={() => setBlockedUsersOpen(true)}
              />
            </SettingsSectionChrome>

            <SettingsSectionChrome title="Hidden content">
              <p className="mb-4 font-apex-body text-sm text-apex-on-surface-variant">
                Review individual sessions, discussions, and comments you have hidden.
              </p>
              <SettingsHiddenContentSection
                onManage={() => setHiddenContentOpen(true)}
              />
            </SettingsSectionChrome>

            <SettingsWeeklyGoalsSection />

            <SettingsAccountActionsSection
              exportDepth={exportDepth}
              onExportDepthChange={setExportDepth}
              exportJob={exportJob}
              exportRequesting={exportRequesting}
              exportPolling={exportPolling}
              cooldownMs={cooldownMs}
              onRequestExport={handleRequestExport}
              onDownloadExport={handleDownloadExport}
              onLogout={handleLogout}
              onDeleteAccount={() => setDeleteDialogOpen(true)}
            />

            <SettingsImpersonationSection />
          </div>
        </div>
      </div>

      <BlockedUsersModal
        open={blockedUsersOpen}
        onOpenChange={setBlockedUsersOpen}
      />
      <HiddenContentModal
        open={hiddenContentOpen}
        onOpenChange={setHiddenContentOpen}
      />
      <SettingsDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
        deleteAccountForm={deleteAccountForm}
        onConfirm={onConfirmDeleteAccount}
        submitting={deleteSubmitting}
        deleteConfirmPhrase={DELETE_CONFIRM_PHRASE}
      />
    </>
  );
}
