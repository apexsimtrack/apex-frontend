import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  appInputClassName,
  appManualTextareaClassName,
  appModalCancelButtonClassName,
  appOutlineButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import {
  DISCUSSION_IMAGE_ACCEPTED_TYPES,
  validateDiscussionImageFile,
} from "@/lib/api/community";

type DiscussionEditModalProps = {
  open: boolean;
  editTitle: string;
  editDescription: string;
  editError: string | null;
  saving: boolean;
  currentImageUrl?: string | null;
  imageFile: File | null;
  removeImage: boolean;
  onClose: () => void;
  onSave: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onImageFileChange: (file: File | null) => void;
  onRemoveImageChange: (remove: boolean) => void;
};

export default function DiscussionEditModal({
  open,
  editTitle,
  editDescription,
  editError,
  saving,
  currentImageUrl,
  imageFile,
  removeImage,
  onClose,
  onSave,
  onTitleChange,
  onDescriptionChange,
  onImageFileChange,
  onRemoveImageChange,
}: DiscussionEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!open) {
      setImageError(null);
    }
  }, [open]);

  const closeModal = () => {
    if (saving) return;
    onClose();
  };

  const applyFile = (file: File | null) => {
    if (!file) {
      onImageFileChange(null);
      setImageError(null);
      return;
    }
    const err = validateDiscussionImageFile(file);
    if (err) {
      setImageError(err);
      onImageFileChange(null);
      return;
    }
    setImageError(null);
    onRemoveImageChange(false);
    onImageFileChange(file);
  };

  const shownUrl =
    previewUrl ??
    (!removeImage && currentImageUrl?.trim() ? currentImageUrl.trim() : null);

  if (!open) return null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={closeModal}
      title="Edit discussion"
      size="lg"
      footer={
        <>
          <button
            type="button"
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={closeModal}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              appPrimaryButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={onSave}
            disabled={
              saving ||
              editTitle.trim().length < 3 ||
              editDescription.trim().length < 10
            }
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {editError && (
          <p className="font-apex-body text-sm text-apex-error">{editError}</p>
        )}
        <div>
          <label className="mb-1.5 block font-apex-body text-sm font-medium text-apex-on-surface">
            Title
          </label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={saving}
            className={appInputClassName}
          />
        </div>
        <div>
          <label className="mb-1.5 block font-apex-body text-sm font-medium text-apex-on-surface">
            Body
          </label>
          <textarea
            className={cn(appManualTextareaClassName, "min-h-[160px] resize-y")}
            value={editDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label className="mb-1.5 block font-apex-body text-sm font-medium text-apex-on-surface">
            Cover image
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={DISCUSSION_IMAGE_ACCEPTED_TYPES.join(",")}
            className="hidden"
            disabled={saving}
            onChange={(e) => {
              applyFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {shownUrl ? (
            <div className="mb-2 overflow-hidden rounded-lg border border-apex-outline-variant/15">
              <img
                src={shownUrl}
                alt=""
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
          ) : (
            <p className="mb-2 font-apex-body text-xs text-apex-on-surface-variant">
              No cover image attached.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              className={cn(appOutlineButtonClassName, "px-3 py-1.5 text-xs")}
              onClick={() => fileInputRef.current?.click()}
            >
              {shownUrl ? "Replace image" : "Add image"}
            </button>
            {shownUrl || currentImageUrl?.trim() ? (
              <button
                type="button"
                disabled={saving}
                className={cn(appOutlineButtonClassName, "px-3 py-1.5 text-xs")}
                onClick={() => {
                  onImageFileChange(null);
                  onRemoveImageChange(true);
                  setImageError(null);
                }}
              >
                Remove image
              </button>
            ) : null}
          </div>
          {imageError ? (
            <p className="mt-2 font-apex-body text-xs text-apex-error">
              {imageError}
            </p>
          ) : null}
        </div>
      </div>
    </AppBaseModal>
  );
}
