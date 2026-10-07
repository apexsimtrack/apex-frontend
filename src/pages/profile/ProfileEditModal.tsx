import type { RefObject } from "react";
import type { UseFormReturn } from "react-hook-form";
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
import type { WithRootError } from "@/lib/formWithRootError";
import type { ProfileEditFormValues } from "@/lib/validation/profileEdit";
import { cn } from "@/lib/utils";
import {
  appInputClassName,
  appModalCancelButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/avatarUpload";

type ProfileEditModalProps = {
  open: boolean;
  onClose: () => void;
  profileEditForm: UseFormReturn<WithRootError<ProfileEditFormValues>>;
  onSave: (values: ProfileEditFormValues) => void | Promise<void>;
  editLoading: boolean;
  editSuccess: boolean;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  avatarPreview: string | null;
  avatarError: string | null;
  onAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAvatarSelection: () => void;
};

export default function ProfileEditModal({
  open,
  onClose,
  profileEditForm,
  onSave,
  editLoading,
  editSuccess,
  avatarInputRef,
  avatarPreview,
  avatarError,
  onAvatarFileChange,
  onClearAvatarSelection,
}: ProfileEditModalProps) {
  const handleClose = () => {
    onClearAvatarSelection();
    onClose();
  };

  return (
    <AppBaseModal
      isOpen={open}
      onClose={handleClose}
      title="Edit Profile"
      description="Update your display name, bio, and profile picture."
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
            disabled={editLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-profile-form"
            className={cn(
              appPrimaryButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            disabled={
              editLoading ||
              profileEditForm.watch("displayName").trim().length < 2
            }
          >
            {editLoading ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <Form {...profileEditForm}>
        <form
          id="edit-profile-form"
          onSubmit={profileEditForm.handleSubmit(onSave)}
          className="space-y-4"
        >
          <FormRootMessage className="rounded-apex-sm bg-apex-error/10 px-3 py-2 font-apex-body text-sm text-apex-error" />
          {editSuccess && (
            <p className="rounded-apex-sm bg-apex-success/10 px-3 py-2 font-apex-body text-sm text-apex-success">
              Profile updated.
            </p>
          )}

          <FormField
            control={profileEditForm.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel
                  htmlFor="edit-displayName"
                  className="font-apex-body text-apex-on-surface"
                >
                  Display name
                </FormLabel>
                <FormControl>
                  <Input
                    id="edit-displayName"
                    type="text"
                    className={appInputClassName}
                    placeholder="Your name"
                    maxLength={40}
                    disabled={editLoading}
                    {...field}
                  />
                </FormControl>
                <p className="mt-0.5 font-apex-body text-xs text-apex-on-surface-variant">
                  {field.value.trim().length}/40
                </p>
                <FormMessage className="font-apex-body text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={profileEditForm.control}
            name="tagline"
            render={({ field }) => (
              <FormItem>
                <FormLabel
                  htmlFor="edit-tagline"
                  className="font-apex-body text-apex-on-surface"
                >
                  Bio
                </FormLabel>
                <FormControl>
                  <Textarea
                    id="edit-tagline"
                    className={cn(appInputClassName, "h-20 resize-none")}
                    placeholder="A short bio..."
                    maxLength={160}
                    disabled={editLoading}
                    {...field}
                  />
                </FormControl>
                <p className="mt-0.5 font-apex-body text-xs text-apex-on-surface-variant">
                  {field.value.length}/160
                </p>
                <FormMessage className="font-apex-body text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <div>
            <label className="mb-1 block font-apex-body text-sm font-medium text-apex-on-surface">
              Profile picture
            </label>
            <p className="mb-2 font-apex-body text-xs text-apex-on-surface-variant">
              Choose an image from your device (JPEG, PNG, or WebP, max 5 MB).
              Images are cropped to a square on upload.
            </p>
            <input
              ref={avatarInputRef}
              id="edit-avatar-file"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              onChange={onAvatarFileChange}
              className="w-full font-apex-body text-sm text-apex-on-surface file:mr-3 file:rounded-apex-sm file:border-0 file:bg-apex-surface-container-highest file:px-3 file:py-2 file:text-sm file:font-medium file:text-apex-on-surface hover:file:bg-apex-surface-container-high"
              disabled={editLoading}
            />
            {avatarError && (
              <p className="mt-1.5 font-apex-body text-sm text-apex-error">
                {avatarError}
              </p>
            )}
            {avatarPreview && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={avatarPreview}
                  alt="Preview"
                  className="size-16 rounded-full border border-apex-outline-variant/20 bg-apex-surface-container-highest object-cover"
                />
                <button
                  type="button"
                  onClick={onClearAvatarSelection}
                  disabled={editLoading}
                  className="font-apex-body text-sm text-apex-on-surface-variant underline underline-offset-2 hover:text-apex-on-surface"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </form>
      </Form>
    </AppBaseModal>
  );
}
