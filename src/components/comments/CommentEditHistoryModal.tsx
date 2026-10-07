import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { appModalCancelButtonClassName } from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";

type CommentEditHistoryModalProps = {
  open: boolean;
  originalBody: string;
  currentBody: string;
  onClose: () => void;
};

export default function CommentEditHistoryModal({
  open,
  originalBody,
  currentBody,
  onClose,
}: CommentEditHistoryModalProps) {
  if (!open) return null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={onClose}
      title="Edit history"
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
      bodyClassName="min-h-0 space-y-5 font-apex-body text-sm"
    >
      <section>
        <h3 className="mb-2 font-apex-headline text-[10px] uppercase tracking-[0.18em] text-apex-on-surface-variant">
          Original
        </h3>
        <p className="whitespace-pre-wrap text-apex-on-surface-variant">
          {originalBody}
        </p>
      </section>
      <section>
        <h3 className="mb-2 font-apex-headline text-[10px] uppercase tracking-[0.18em] text-apex-on-surface-variant">
          Current
        </h3>
        <p className="whitespace-pre-wrap text-apex-on-surface">
          {currentBody}
        </p>
      </section>
    </AppBaseModal>
  );
}
