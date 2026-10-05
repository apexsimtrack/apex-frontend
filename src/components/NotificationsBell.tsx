import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Megaphone,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { Button } from "@/components/ui/button";
import { RaceHistoryPagination } from "@/components/RaceHistoryPagination";
import { withRequestId,
  acceptFollowRequest,
  clearNotifications,
  declineFollowRequest,
  getNotifications,
  listFollowRequests,
  markNotificationsRead,
  resolveApiUrl,
  type NotificationItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAfterFirstPaint } from "@/hooks/useAfterFirstPaint";
import {
  isRichNotification,
  notificationAge,
  socialNotificationLabel,
  socialNotificationLink,
} from "@/lib/notificationDisplay";

import { appOutlineButtonClassName } from "@/components/app-ui/appButtonClasses";

const NOTIFICATIONS_KEY = ["notifications"] as const;
const FOLLOW_REQUESTS_KEY = ["followRequests", "incoming"] as const;
const ACTIVITY_PAGE_SIZE = 8;
const REQUESTS_PAGE_SIZE = 8;

export function NotificationsBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"activity" | "requests">("activity");
  const [actionId, setActionId] = useState<string | null>(null);
  const [markingViewed, setMarkingViewed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [requestsPage, setRequestsPage] = useState(1);
  const chromeIdleReady = useAfterFirstPaint(Boolean(user));

  useEffect(() => {
    const openHandler = () => {
      setTab("requests");
      setOpen(true);
    };
    window.addEventListener("apex:open-notifications", openHandler);
    return () =>
      window.removeEventListener("apex:open-notifications", openHandler);
  }, []);

  const notifQuery = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: getNotifications,
    staleTime: 15_000,
    enabled: Boolean(user) && chromeIdleReady,
  });

  const requestsQuery = useQuery({
    queryKey: FOLLOW_REQUESTS_KEY,
    queryFn: listFollowRequests,
    enabled: open && Boolean(user),
    staleTime: 15_000,
  });

  const notifications = notifQuery.data?.notifications ?? [];
  const requests = requestsQuery.data?.requests ?? [];
  const unreadCount =
    typeof notifQuery.data?.unreadCount === "number"
      ? notifQuery.data.unreadCount
      : notifications.filter((n) => !n.read).length;
  const showBadge = user?.showNotificationBadge !== false && unreadCount > 0;
  const activityTotalPages = Math.max(
    1,
    Math.ceil(notifications.length / ACTIVITY_PAGE_SIZE),
  );
  const requestsTotalPages = Math.max(
    1,
    Math.ceil(requests.length / REQUESTS_PAGE_SIZE),
  );
  const visibleNotifications = notifications.slice(
    (activityPage - 1) * ACTIVITY_PAGE_SIZE,
    activityPage * ACTIVITY_PAGE_SIZE,
  );
  const visibleRequests = requests.slice(
    (requestsPage - 1) * REQUESTS_PAGE_SIZE,
    requestsPage * REQUESTS_PAGE_SIZE,
  );

  useEffect(() => {
    setActivityPage((page) => Math.min(page, activityTotalPages));
  }, [activityTotalPages]);

  useEffect(() => {
    setRequestsPage((page) => Math.min(page, requestsTotalPages));
  }, [requestsTotalPages]);

  useEffect(() => {
    if (!open) return;
    setActivityPage(1);
    setRequestsPage(1);
  }, [open]);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  const handleMarkAllViewed = useCallback(async () => {
    setMarkingViewed(true);
    try {
      await markNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      toast.success("Marked all notifications as viewed.");
    } catch (e) {
      toast.error(
        withRequestId(e instanceof Error ? e.message : "Could not update notifications.", e),
      );
    } finally {
      setMarkingViewed(false);
    }
  }, [queryClient]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      const { deleted } = await clearNotifications();
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      toast.success(
        deleted === 0
          ? "No notifications to clear."
          : `Cleared ${deleted} notification${deleted === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      toast.error(
        withRequestId(e instanceof Error ? e.message : "Could not clear notifications.", e),
      );
    } finally {
      setClearing(false);
    }
  }, [queryClient]);

  const handleAccept = async (requestId: string) => {
    setActionId(requestId);
    try {
      await acceptFollowRequest(requestId);
      await queryClient.invalidateQueries({ queryKey: FOLLOW_REQUESTS_KEY });
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      await queryClient.invalidateQueries({
        queryKey: ["profile", "followList"],
      });
      await queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    } catch (e) {
      const msg =
        withRequestId(e instanceof Error ? e.message : "Could not approve request.", e);
      toast.error(msg);
      void queryClient.invalidateQueries({ queryKey: FOLLOW_REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    } finally {
      setActionId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setActionId(requestId);
    try {
      await declineFollowRequest(requestId);
      await queryClient.invalidateQueries({ queryKey: FOLLOW_REQUESTS_KEY });
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    } catch (e) {
      const msg =
        withRequestId(e instanceof Error ? e.message : "Could not decline request.", e);
      toast.error(msg);
      void queryClient.invalidateQueries({ queryKey: FOLLOW_REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    } finally {
      setActionId(null);
    }
  };

  const footerBusy = markingViewed || clearing;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center text-apex-on-surface-variant transition-colors hover:text-apex-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apex-primary/70"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="size-6" aria-hidden />
        {showBadge ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-apex-primary px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <AppBaseModal
        isOpen={open}
        onClose={() => onOpenChange(false)}
        title="Notifications"
        size="md"
        // Phones: fill the (safe-area inset) screen and keep the surrounding
        // chrome to one row each, so the list itself gets the space.
        mobileVariant="fullscreen"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-0 px-4 py-0 sm:px-6"
        footerClassName="flex-row justify-end gap-2 pt-3 sm:pt-4"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(appOutlineButtonClassName, "flex-1 sm:flex-none")}
              disabled={footerBusy || notifications.length === 0}
              onClick={() => void handleMarkAllViewed()}
            >
              {markingViewed ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              <span className="sm:hidden">Mark all</span>
              <span className="hidden sm:inline">Mark all as viewed</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                appOutlineButtonClassName,
                "flex-1 text-apex-error hover:bg-apex-error/10 sm:flex-none",
              )}
              disabled={footerBusy || notifications.length === 0}
              onClick={() => void handleClearAll()}
            >
              {clearing ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              <span className="sm:hidden">Clear</span>
              <span className="hidden sm:inline">Clear notifications</span>
            </Button>
          </>
        }
      >
        <div className="shrink-0 border-b border-apex-outline-variant/15 py-2 sm:py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("activity")}
              className={cn(
                "rounded-apex-sm px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "activity"
                  ? "bg-apex-surface-container text-apex-on-surface"
                  : "text-apex-on-surface-variant hover:text-apex-on-surface",
              )}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setTab("requests")}
              className={cn(
                "rounded-apex-sm px-3 py-1.5 text-xs font-medium transition-colors",
                tab === "requests"
                  ? "bg-apex-surface-container text-apex-on-surface"
                  : "text-apex-on-surface-variant hover:text-apex-on-surface",
              )}
            >
              <span className="sm:hidden">Requests</span>
              <span className="hidden sm:inline">Follow requests</span>
              {requests.length > 0 && (
                <span className="ml-1.5 rounded-full bg-apex-primary/20 px-1.5 py-0.5 text-[10px] text-apex-primary">
                  {requests.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col py-3 sm:py-4">
          {tab === "activity" ? (
            <>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
                <NotificationList
                  notifications={visibleNotifications}
                  loading={notifQuery.isPending}
                  actionId={actionId}
                  onAcceptRequest={handleAccept}
                  onDeclineRequest={handleDecline}
                />
              </div>
              {!notifQuery.isPending && activityTotalPages > 1 ? (
                <div className="mt-2 border-t border-apex-outline-variant/15 pt-2 sm:mt-4 sm:pt-3">
                  {/* Desktop only: on a phone the pager itself is the context. */}
                  <p className="mb-3 hidden text-center text-xs text-apex-on-surface-variant sm:block">
                    {getPageSummary(
                      activityPage,
                      ACTIVITY_PAGE_SIZE,
                      notifications.length,
                      "notifications",
                    )}
                  </p>
                  <RaceHistoryPagination
                    page={activityPage}
                    totalPages={activityTotalPages}
                    onPageChange={setActivityPage}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
                <FollowRequestsPanel
                  loading={requestsQuery.isPending}
                  requests={visibleRequests}
                  actionId={actionId}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              </div>
              {!requestsQuery.isPending && requestsTotalPages > 1 ? (
                <div className="mt-2 border-t border-apex-outline-variant/15 pt-2 sm:mt-4 sm:pt-3">
                  <p className="mb-3 hidden text-center text-xs text-apex-on-surface-variant sm:block">
                    {getPageSummary(
                      requestsPage,
                      REQUESTS_PAGE_SIZE,
                      requests.length,
                      "requests",
                    )}
                  </p>
                  <RaceHistoryPagination
                    page={requestsPage}
                    totalPages={requestsTotalPages}
                    onPageChange={setRequestsPage}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </AppBaseModal>
    </>
  );
}

function NotificationList({
  notifications,
  loading,
  actionId,
  onAcceptRequest,
  onDeclineRequest,
}: {
  notifications: NotificationItem[];
  loading: boolean;
  actionId: string | null;
  onAcceptRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-apex-on-surface-variant" />
      </div>
    );
  }
  if (notifications.length === 0) {
    return (
      <p className="flex h-full items-center justify-center py-8 text-center text-sm text-apex-on-surface-variant">
        No notifications yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2 sm:space-y-3">
      {notifications.map((n) => {
        if (isRichNotification(n)) {
          return <SystemAnnouncementRow key={n.id} notification={n} />;
        }
        if (!n.actor) {
          return null;
        }
        const activityLink = socialNotificationLink(n.type, n.entityId);
        const resolvedLink = activityLink ? activityLink : null;
        return (
          <li
            key={n.id}
            className={cn(
              "flex gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low p-2.5 sm:p-3",
              !n.read && "border-apex-primary/30",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm text-apex-on-surface">
                  <span className="font-medium">{n.actor.displayName}</span>{" "}
                  {socialNotificationLabel(n.type)}
                </p>
                <span
                  className="shrink-0 text-xs text-apex-on-surface-variant"
                  title={new Date(n.createdAt).toLocaleString()}
                >
                  {notificationAge(n.createdAt)}
                </span>
              </div>
              {resolvedLink ? (
                <a
                  href={resolvedLink}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-apex-primary hover:underline"
                >
                  View
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
              {n.type === "FOLLOW_REQUEST" && n.entityId ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1"
                    disabled={actionId === n.entityId}
                    onClick={() => onAcceptRequest(n.entityId!)}
                  >
                    {actionId === n.entityId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={actionId === n.entityId}
                    onClick={() => onDeclineRequest(n.entityId!)}
                  >
                    <X className="size-3.5" />
                    Decline
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SystemAnnouncementRow({
  notification,
}: {
  notification: NotificationItem;
}) {
  const linkUrl = notification.linkUrl ? notification.linkUrl : null;
  const severity = notification.severity ?? "INFO";
  const theme = {
    INFO: {
      border: "border-sky-500/30",
      chip: "bg-sky-500/15 text-sky-300",
      iconBg: "bg-sky-500/20 text-sky-200",
    },
    SUCCESS: {
      border: "border-emerald-500/30",
      chip: "bg-emerald-500/15 text-emerald-300",
      iconBg: "bg-emerald-500/20 text-emerald-200",
    },
    WARNING: {
      border: "border-amber-500/30",
      chip: "bg-amber-500/15 text-amber-300",
      iconBg: "bg-amber-500/20 text-amber-200",
    },
    CRITICAL: {
      border: "border-red-500/30",
      chip: "bg-red-500/15 text-red-300",
      iconBg: "bg-red-500/25 text-red-200",
    },
    MAINTENANCE: {
      border: "border-violet-500/30",
      chip: "bg-violet-500/15 text-violet-300",
      iconBg: "bg-violet-500/20 text-violet-200",
    },
  }[severity];
  const Icon =
    severity === "CRITICAL"
      ? AlertTriangle
      : severity === "WARNING"
        ? AlertTriangle
        : severity === "SUCCESS"
          ? CheckCircle2
          : severity === "MAINTENANCE"
            ? Wrench
            : severity === "INFO"
              ? Info
              : Megaphone;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-apex-lg border bg-apex-surface-container-low p-2.5 sm:p-3",
        theme.border,
        !notification.read && "ring-1 ring-apex-primary/20",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full",
          theme.iconBg,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {notification.title ? (
            <span className="text-sm font-semibold text-apex-on-surface">
              {notification.title}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
              theme.chip,
            )}
          >
            {severity}
          </span>
        </div>
        {notification.body ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-apex-on-surface/90">
            {notification.body}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-apex-on-surface-variant">
          <span title={new Date(notification.createdAt).toLocaleString()}>
            {notificationAge(notification.createdAt)}
          </span>
          {linkUrl ? (
            <a
              href={linkUrl}
              target={linkUrl.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-apex-primary hover:underline"
            >
              Open <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function FollowRequestsPanel({
  loading,
  requests,
  actionId,
  onAccept,
  onDecline,
}: {
  loading: boolean;
  requests: {
    id: string;
    createdAt: string;
    follower: { id: string; displayName: string; avatarUrl: string | null };
  }[];
  actionId: string | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-apex-on-surface-variant" />
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <p className="flex h-full items-center justify-center py-8 text-center text-sm text-apex-on-surface-variant">
        No pending follow requests.
      </p>
    );
  }
  return (
    <ul className="space-y-2 sm:space-y-3">
      {requests.map((r) => {
        const avatar = resolveApiUrl(r.follower.avatarUrl);
        const busy = actionId === r.id;
        return (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low p-2.5 sm:p-3"
          >
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="size-10 shrink-0 rounded-full object-cover ring-1 ring-apex-outline-variant/20"
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-apex-surface-container-highest text-xs text-apex-on-surface-variant">
                {(r.follower.displayName ?? "?").slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-apex-on-surface">
                {r.follower.displayName}
              </p>
              <p
                className="text-xs text-apex-on-surface-variant"
                title={new Date(r.createdAt).toLocaleString()}
              >
                {notificationAge(r.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="gap-1"
                disabled={busy}
                onClick={() => void onAccept(r.id)}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={busy}
                onClick={() => void onDecline(r.id)}
              >
                <X className="size-3.5" />
                Decline
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function getPageSummary(
  page: number,
  pageSize: number,
  total: number,
  label: string,
) {
  if (total === 0) return `Showing 0 of 0 ${label}`;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `Showing ${start}-${end} of ${total} ${label}`;
}
