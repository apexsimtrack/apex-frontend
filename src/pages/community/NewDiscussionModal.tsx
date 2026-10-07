import type { UseFormReturn } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRootMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DISCUSSION_CATEGORIES,
  DISCUSSION_IMAGE_ACCEPTED_TYPES,
  validateDiscussionImageFile,
} from "@/lib/api/community";
import type { WithRootError } from "@/lib/formWithRootError";
import type { NewDiscussionFormValues } from "@/lib/validation/community";
import { cn } from "@/lib/utils";
import {
  appInputClassName,
  appManualTextareaClassName,
  appModalCancelButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { ImagePlus, X } from "lucide-react";

const createCategories = DISCUSSION_CATEGORIES.filter((c) => c.value !== "all");

type NewDiscussionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<WithRootError<NewDiscussionFormValues>>;
  creating: boolean;
  imageFile: File | null;
  onImageFileChange: (file: File | null) => void;
  onSubmit: (values: NewDiscussionFormValues) => void | Promise<void>;
};

export default function NewDiscussionModal({
  open,
  onOpenChange,
  form,
  creating,
  imageFile,
  onImageFileChange,
  onSubmit,
}: NewDiscussionModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
      setDragOver(false);
    }
  }, [open]);

  const closeModal = () => {
    if (creating) return;
    onOpenChange(false);
    form.clearErrors("root");
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
    onImageFileChange(file);
  };

  if (!open) return null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={closeModal}
      title="Create New Discussion"
      size="xl"
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
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-discussion-form"
            className={cn(
              appPrimaryButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            disabled={creating}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <Form {...form}>
        <form
          id="create-discussion-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormRootMessage className="mb-4 font-apex-body text-xs text-apex-error" />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem className="mb-6">
                <FormLabel className="mb-3 block font-apex-body text-sm font-medium text-apex-on-surface">
                  Category
                </FormLabel>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {createCategories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => {
                        field.onChange(cat.value);
                      }}
                      className={cn(
                        "rounded-apex-sm border p-3 font-apex-body text-sm font-medium transition-all",
                        field.value === cat.value
                          ? "border-apex-primary/60 bg-apex-primary/10 text-apex-on-surface"
                          : "text-apex-on-surface hover:border-apex-outline-variant/30",
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <FormMessage className="font-apex-body text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="mb-6">
                <FormLabel className="mb-0.5 block font-apex-body text-sm font-medium text-apex-on-surface">
                  Discussion Title
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="What's your question or topic?"
                    disabled={creating}
                    className={appInputClassName}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="font-apex-body text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="mb-6">
                <FormLabel className="mb-0.5 block font-apex-body text-sm font-medium text-apex-on-surface">
                  Description
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe your discussion in detail..."
                    disabled={creating}
                    className={cn(
                      appManualTextareaClassName,
                      "h-32 resize-none",
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="font-apex-body text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <div className="mb-2">
            <p className="mb-2 font-apex-body text-sm font-medium text-apex-on-surface">
              Cover image{" "}
              <span className="font-normal text-apex-on-surface-variant">
                (optional)
              </span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={DISCUSSION_IMAGE_ACCEPTED_TYPES.join(",")}
              className="hidden"
              disabled={creating}
              onChange={(e) => {
                applyFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-lg border border-apex-outline-variant/20 bg-apex-surface-container">
                <img
                  src={previewUrl}
                  alt="Cover preview"
                  className="aspect-[16/9] w-full object-cover"
                />
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => applyFile(null)}
                  className="absolute right-2 top-2 rounded-full bg-apex-background/80 p-1.5 text-apex-on-surface hover:bg-apex-background"
                  aria-label="Remove image"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={creating}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  applyFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 font-apex-body text-sm text-apex-on-surface-variant transition-colors",
                  dragOver
                    ? "border-apex-primary bg-apex-primary/10"
                    : "border-apex-outline-variant/30 bg-apex-surface-container hover:border-apex-outline-variant/50",
                )}
              >
                <ImagePlus className="size-6 text-apex-on-surface-variant" />
                <span>Drop an image here, or click to browse</span>
                <span className="text-xs">JPEG, PNG, or WebP · max 5MB</span>
              </button>
            )}
            {imageError ? (
              <p className="mt-2 font-apex-body text-xs text-apex-error">
                {imageError}
              </p>
            ) : null}
          </div>
        </form>
      </Form>
    </AppBaseModal>
  );
}
