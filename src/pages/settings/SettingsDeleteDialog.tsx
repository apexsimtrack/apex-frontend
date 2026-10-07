import type { UseFormReturn } from "react-hook-form";
import { Loader2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormRootMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import type { WithRootError } from "@/lib/formWithRootError";
import type { DeleteAccountFormValues } from "@/lib/validation/settingsForms";
import { cn } from "@/lib/utils";
import {
  appDestructiveButtonClassName,
  appInputClassName,
  appModalCancelButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseAlertDialog } from "@/components/app-ui/AppBaseModal";

type SettingsDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteAccountForm: UseFormReturn<WithRootError<DeleteAccountFormValues>>;
  onConfirm: (values: DeleteAccountFormValues) => void | Promise<void>;
  submitting: boolean;
  deleteConfirmPhrase: string;
};

export default function SettingsDeleteDialog({
  open,
  onOpenChange,
  deleteAccountForm,
  onConfirm,
  submitting,
  deleteConfirmPhrase,
}: SettingsDeleteDialogProps) {
  return (
    <AppBaseAlertDialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Delete account"
      description={
        <>
          <span className="block">
            This will sign you out everywhere, revoke sessions, and anonymize
            your email, password, name, avatar, and bio. You will not be able to
            sign in again with this account.
          </span>
          <span className="block font-medium text-apex-on-surface">
            Type {deleteConfirmPhrase} below to confirm.
          </span>
        </>
      }
      size="sm"
      footer={
        <>
          <button
            type="button"
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="delete-account-form"
            className={cn(
              appDestructiveButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
              submitting && "cursor-not-allowed opacity-60",
            )}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Deleting…
              </>
            ) : (
              "Delete permanently"
            )}
          </button>
        </>
      }
    >
      <Form {...deleteAccountForm}>
        <form
          id="delete-account-form"
          onSubmit={deleteAccountForm.handleSubmit(onConfirm)}
          className="space-y-3"
        >
          <FormField
            control={deleteAccountForm.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <PasswordInput
                    autoComplete="current-password"
                    placeholder="Current password"
                    disabled={submitting}
                    className={appInputClassName}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      deleteAccountForm.clearErrors("root");
                    }}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />
          <FormField
            control={deleteAccountForm.control}
            name="confirmPhrase"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder={`Type ${deleteConfirmPhrase}`}
                    disabled={submitting}
                    className={appInputClassName}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      deleteAccountForm.clearErrors("root");
                    }}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />
          <FormRootMessage className="text-xs text-apex-error" />
        </form>
      </Form>
    </AppBaseAlertDialog>
  );
}
