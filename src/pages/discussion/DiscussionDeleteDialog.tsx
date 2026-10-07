import { cn } from "@/lib/utils";
import {
  appDestructiveButtonClassName,
  appModalCancelButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseAlertDialog } from "@/components/app-ui/AppBaseModal";

type DiscussionDeleteDialogProps = {
  open: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DiscussionDeleteDialog({
  open,
  deleting,
  onClose,
  onConfirm,
}: DiscussionDeleteDialogProps) {
  return (
    <AppBaseAlertDialog
      isOpen={open}
      onClose={onClose}
      title="Delete this discussion?"
      description="This removes the post from the community. You can't undo this from the site; contact support if you deleted by mistake."
      footer={
        <>
          <button
            type="button"
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            disabled={deleting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              appDestructiveButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    />
  );
}
