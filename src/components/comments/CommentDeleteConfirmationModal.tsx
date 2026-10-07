import { AppBaseAlertDialog } from "@/components/app-ui/AppBaseModal";
import {
  appModalCancelButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";

type CommentDeleteConfirmationModalProps = {
  open: boolean;
  isReply: boolean;
  hasReplies: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function CommentDeleteConfirmationModal({
  open,
  isReply,
  hasReplies,
  onCancel,
  onConfirm,
}: CommentDeleteConfirmationModalProps) {
  const label = isReply ? "reply" : "comment";

  return (
    <AppBaseAlertDialog
      isOpen={open}
      onClose={onCancel}
      title={`Delete ${label}?`}
      description={
        hasReplies
          ? "This will permanently delete this comment and every reply in its thread."
          : `This ${label} will be deleted. This action cannot be undone.`
      }
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex h-9 items-center justify-center px-4 text-sm",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              appPrimaryButtonClassName,
              "inline-flex h-9 items-center justify-center px-4 text-sm",
            )}
          >
            Delete
          </button>
        </>
      }
    />
  );
}
