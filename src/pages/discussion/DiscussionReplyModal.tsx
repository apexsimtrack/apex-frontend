import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  appManualTextareaClassName,
  appModalCancelButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { DISCUSSION_REPLY_NEAR_LIMIT } from "@/pages/discussion/discussionReplyUtils";

type DiscussionReplyModalProps = {
  open: boolean;
  onClose: () => void;
  replyBody: string;
  replyError: string | null;
  posting: boolean;
  onReplyBodyChange: (value: string) => void;
  onPostReply: () => void;
};

export default function DiscussionReplyModal({
  open,
  onClose,
  replyBody,
  replyError,
  posting,
  onReplyBodyChange,
  onPostReply,
}: DiscussionReplyModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const closeModal = () => {
    if (posting) return;
    onClose();
  };

  const nearLimit = replyBody.length >= DISCUSSION_REPLY_NEAR_LIMIT;

  if (!open) return null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={closeModal}
      title="Add a reply"
      size="md"
      mobileVariant="fullscreen"
      footer={
        <>
          <button
            type="button"
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={closeModal}
            disabled={posting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              appPrimaryButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={onPostReply}
            disabled={!replyBody.trim() || posting}
          >
            {posting ? "Posting…" : "Post reply"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {replyError && (
          <p className="font-apex-body text-sm text-apex-error">{replyError}</p>
        )}
        <textarea
          ref={textareaRef}
          className={cn(appManualTextareaClassName, "min-h-[160px] resize-y")}
          rows={4}
          placeholder="Write a reply…"
          value={replyBody}
          onChange={(e) => onReplyBodyChange(e.target.value)}
          disabled={posting}
        />
        {nearLimit && (
          <p className="font-apex-body text-xs text-apex-on-surface-variant">
            Approaching 2,000 character limit ({replyBody.length}
            /2000)
          </p>
        )}
      </div>
    </AppBaseModal>
  );
}
