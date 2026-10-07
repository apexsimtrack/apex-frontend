import { cn } from "@/lib/utils";
import { appModalCancelButtonClassName } from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import type { Discussion } from "@/lib/api/community";

type DiscussionOriginalPostModalProps = {
  open: boolean;
  discussion: Discussion;
  onClose: () => void;
};

export default function DiscussionOriginalPostModal({
  open,
  discussion,
  onClose,
}: DiscussionOriginalPostModalProps) {
  if (!open) return null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={onClose}
      title="Original post"
      size="md"
      footer={
        <button
          type="button"
          className={cn(
            appModalCancelButtonClassName,
            "inline-flex items-center justify-center px-4 py-2",
          )}
          onClick={onClose}
        >
          Close
        </button>
      }
      bodyClassName="min-h-0 space-y-3 font-apex-body text-sm"
    >
      <p className="font-semibold text-apex-on-surface">
        {discussion.originalTitle ?? discussion.title}
      </p>
      <p className="whitespace-pre-wrap text-apex-on-surface-variant">
        {discussion.originalBody ??
          discussion.content ??
          discussion.description ??
          ""}
      </p>
    </AppBaseModal>
  );
}
