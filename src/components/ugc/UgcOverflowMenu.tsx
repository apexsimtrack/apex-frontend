import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, EyeOff, Ban, Flag, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AppBaseAlertDialog,
  AppBaseModal,
} from "@/components/app-ui/AppBaseModal";
import {
  appDropdownContentClassName,
  appDropdownDangerItemClassName,
  appDropdownItemClassName,
  appDestructiveButtonClassName,
  appModalCancelButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";
import {
  blockUser,
  hideContent,
  submitReport,
  REPORT_DETAILS_MAX,
  REPORT_DETAILS_MIN,
  REPORT_REASONS,
  type HiddenContentType,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/api/ugcModeration";
import { apiErrorText } from "@/lib/api/errors";
import {
  applyOptimisticBlock,
  applyOptimisticHide,
  invalidateAfterUgcModeration,
  rollbackUgcModerationCache,
  snapshotUgcModerationCache,
} from "@/lib/ugcModerationCache";
import { getUgcOverflowMenuPolicy } from "./ugcOverflowMenuPolicy";

type ConfirmKind = "hide" | "block" | "report" | null;

type UgcOverflowMenuProps = {
  signedIn: boolean;
  isOwn: boolean;
  authorId?: string | null;
  hide?: {
    contentType: HiddenContentType;
    targetContentId: string;
  };
  report?:
    | {
        contentType: ReportTargetType;
        targetContentId?: string;
        targetUserId?: string;
      }
    | null;
  /** When false, Block is omitted (e.g. profile already has a Block button). */
  showBlock?: boolean;
  className?: string;
  align?: "end" | "start";
};

export default function UgcOverflowMenu({
  signedIn,
  isOwn,
  authorId,
  hide,
  report,
  showBlock = true,
  className,
  align = "end",
}: UgcOverflowMenuProps) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const reportReasonId = useId();
  const reportDetailsId = useId();
  const reportContentType = report?.contentType ?? hide?.contentType ?? "USER";
  const reportTargetContentId =
    report?.targetContentId ?? hide?.targetContentId;
  const reportTargetUserId = report?.targetUserId ?? authorId ?? undefined;
  const { canHide, canBlock, canReport, canRender } =
    getUgcOverflowMenuPolicy({
      signedIn,
      isOwn,
      hideTargetContentId: hide?.targetContentId,
      authorId,
      showBlock,
      reportEnabled: report !== null,
      reportContentType,
      reportTargetContentId,
      reportTargetUserId,
    });

  const reportMutation = useMutation({
    mutationFn: () =>
      submitReport({
        contentType: reportContentType,
        reason,
        details: reason === "Other" ? details.trim() : undefined,
        targetUserId: reportTargetUserId,
        targetContentId: reportTargetContentId,
      }),
    onSuccess: () => {
      toast.success("Report submitted");
      setConfirm(null);
      setReason(REPORT_REASONS[0]);
      setDetails("");
    },
    onError: (err) => {
      toast.error(
        apiErrorText(err, "Could not submit this report."),
      );
    },
  });

  if (!canRender) return null;
  const trimmedDetails = details.trim();
  const detailsTooShort =
    reason === "Other" &&
    trimmedDetails.length > 0 &&
    trimmedDetails.length < REPORT_DETAILS_MIN;
  const detailsValid =
    reason !== "Other" ||
    (trimmedDetails.length >= REPORT_DETAILS_MIN &&
      trimmedDetails.length <= REPORT_DETAILS_MAX);
  const closeReport = () => {
    if (reportMutation.isPending) return;
    setConfirm(null);
    setReason(REPORT_REASONS[0]);
    setDetails("");
  };

  const runHide = async () => {
    if (!hide) return;
    setPending(true);
    const snapshot = await snapshotUgcModerationCache(queryClient);
    applyOptimisticHide(queryClient, hide.contentType, hide.targetContentId);
    try {
      await hideContent(hide.contentType, hide.targetContentId);
      toast.success("Content hidden");
      invalidateAfterUgcModeration(queryClient);
      setConfirm(null);
    } catch (err) {
      rollbackUgcModerationCache(queryClient, snapshot);
      toast.error(
        apiErrorText(err, "Could not hide this content."),
      );
    } finally {
      setPending(false);
    }
  };

  const runBlock = async () => {
    if (!authorId) return;
    setPending(true);
    const snapshot = await snapshotUgcModerationCache(queryClient);
    applyOptimisticBlock(queryClient, authorId);
    try {
      await blockUser(authorId);
      toast.success("User blocked");
      invalidateAfterUgcModeration(queryClient);
      setConfirm(null);
    } catch (err) {
      rollbackUgcModerationCache(queryClient, snapshot);
      toast.error(
        apiErrorText(err, "Could not block this user."),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={cn("z-10", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-apex-on-surface-variant hover:bg-apex-surface-container-high hover:text-apex-on-surface"
            aria-label="More actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className={cn(appDropdownContentClassName, "min-w-[11rem]")}
        >
          {canHide ? (
            <DropdownMenuItem
              className={appDropdownItemClassName}
              onClick={() => setConfirm("hide")}
            >
              <EyeOff className="mr-2 size-4" />
              Hide content
            </DropdownMenuItem>
          ) : null}
          {canReport ? (
            <DropdownMenuItem
              className={appDropdownItemClassName}
              onClick={() => setConfirm("report")}
            >
              <Flag className="mr-2 size-4" />
              Report
            </DropdownMenuItem>
          ) : null}
          {canBlock ? (
            <DropdownMenuItem
              className={appDropdownDangerItemClassName}
              onClick={() => setConfirm("block")}
            >
              <Ban className="mr-2 size-4" />
              Block user
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AppBaseAlertDialog
        isOpen={confirm === "hide"}
        onClose={() => !pending && setConfirm(null)}
        title="Hide this content?"
        description="It will be removed from your feeds and threads. You can manage hidden content in Settings."
        footer={
          <>
            <button
              type="button"
              className={cn(appModalCancelButtonClassName, "px-4 py-2")}
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(appDestructiveButtonClassName, "px-4 py-2")}
              disabled={pending}
              onClick={() => void runHide()}
            >
              {pending ? "Hiding…" : "Hide"}
            </button>
          </>
        }
      />

      <AppBaseAlertDialog
        isOpen={confirm === "block"}
        onClose={() => !pending && setConfirm(null)}
        title="Block this user?"
        description="You will no longer see their discussions, comments, or activity. They are also unfollowed."
        footer={
          <>
            <button
              type="button"
              className={cn(appModalCancelButtonClassName, "px-4 py-2")}
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(appDestructiveButtonClassName, "px-4 py-2")}
              disabled={pending}
              onClick={() => void runBlock()}
            >
              {pending ? "Blocking…" : "Block"}
            </button>
          </>
        }
      />

      <AppBaseModal
        isOpen={confirm === "report"}
        onClose={closeReport}
        title="Report"
        description="Tell us why this should be reviewed. Reporting does not hide the content for you."
        size="sm"
        footer={
          <>
            <button
              type="button"
              className={cn(appModalCancelButtonClassName, "px-4 py-2")}
              disabled={reportMutation.isPending}
              onClick={closeReport}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(appPrimaryButtonClassName, "px-4 py-2")}
              disabled={reportMutation.isPending || !detailsValid}
              onClick={() => reportMutation.mutate()}
            >
              {reportMutation.isPending ? "Submitting…" : "Submit report"}
            </button>
          </>
        }
      >
        <label
          htmlFor={reportReasonId}
          className="mt-1 block font-apex-body text-xs font-medium text-apex-on-surface-variant"
        >
          Reason
        </label>
        <div className="relative mt-1">
          <select
            id={reportReasonId}
            className="w-full appearance-none rounded-md border border-apex-outline-variant/40 bg-apex-surface-container-low py-2 pl-3 pr-10 font-apex-body text-sm text-apex-on-surface"
            value={reason}
            onChange={(e) => {
              const next = e.target.value as ReportReason;
              setReason(next);
              if (next !== "Other") setDetails("");
            }}
          >
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-apex-on-surface-variant"
            aria-hidden
          />
        </div>
        {reason === "Other" ? (
          <div className="mt-4">
            <label
              htmlFor={reportDetailsId}
              className="block font-apex-body text-xs font-medium text-apex-on-surface-variant"
            >
              Tell us what happened
            </label>
            <textarea
              id={reportDetailsId}
              className="mt-1 h-28 w-full resize-none rounded-md border border-apex-outline-variant/40 bg-apex-surface-container-low px-3 py-2 font-apex-body text-sm text-apex-on-surface outline-none focus:border-apex-primary"
              value={details}
              minLength={REPORT_DETAILS_MIN}
              maxLength={REPORT_DETAILS_MAX}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the issue for the moderation team."
              aria-invalid={detailsTooShort}
              aria-describedby={`${reportDetailsId}-help`}
            />
            <div
              id={`${reportDetailsId}-help`}
              className={cn(
                "mt-1 flex justify-between gap-3 font-apex-body text-xs",
                detailsTooShort
                  ? "text-apex-error"
                  : "text-apex-on-surface-variant",
              )}
            >
              <span>
                {detailsTooShort
                  ? `Enter at least ${REPORT_DETAILS_MIN} characters.`
                  : `${REPORT_DETAILS_MIN}-${REPORT_DETAILS_MAX} characters`}
              </span>
              <span>
                {details.length}/{REPORT_DETAILS_MAX}
              </span>
            </div>
          </div>
        ) : null}
      </AppBaseModal>
    </div>
  );
}
