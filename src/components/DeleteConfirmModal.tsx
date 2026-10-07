import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { withRequestId } from "@/lib/api/errors";
import {
  appDestructiveButtonClassName,
  appModalCancelButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseAlertDialog } from "@/components/app-ui/AppBaseModal";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title?: string;
  message?: string;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete this manual activity?",
  message = "This cannot be undone.",
}: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsDeleting(false);
      setError(null);
    }
  }, [isOpen]);

  async function handleConfirm() {
    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm();
    } catch (err) {
      setError(
        withRequestId(
          err instanceof Error
            ? err.message
            : "Failed to delete. Please try again.",
          err,
        ),
      );
      setIsDeleting(false);
    }
  }

  function handleClose() {
    if (isDeleting) return;
    onClose();
  }

  return (
    <AppBaseAlertDialog
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={message}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              appDestructiveButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </button>
        </>
      }
      bodyClassName="space-y-4 text-center"
    >
      <div className="flex justify-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-apex-error/10">
          <AlertTriangle className="size-6 text-apex-error" />
        </div>
      </div>
      {error && (
        <div className="rounded-apex-sm bg-apex-error/10 px-3 py-2">
          <p className="text-center font-apex-body text-sm text-apex-error">
            {error}
          </p>
        </div>
      )}
    </AppBaseAlertDialog>
  );
}
