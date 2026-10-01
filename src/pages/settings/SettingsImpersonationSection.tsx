import { useState } from "react";
import { EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exitImpersonationSession } from "@/lib/api/impersonationAuth";
import { withRequestId } from "@/lib/api/errors";
import {
  impersonatedUserEmail,
  isImpersonating,
} from "@/lib/impersonation";
import { appOutlineButtonClassName } from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";
import { SettingsSectionChrome } from "./SettingsSectionChrome";

export default function SettingsImpersonationSection() {
  const [busy, setBusy] = useState(false);

  if (!isImpersonating()) return null;

  const stopImpersonating = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const restored = await exitImpersonationSession();
      if (!restored) {
        toast.error(
          "Could not restore admin session. Sign out and sign in again.",
        );
        return;
      }
      window.location.assign("/admin/users");
    } catch (err) {
      toast.error(
        withRequestId(
          "Could not restore admin session. Sign out and sign in again.",
          err,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSectionChrome title="Admin support session">
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 text-apex-on-surface-variant">
          <EyeOff className="mt-0.5 size-4 shrink-0" />
          <p>
            You are viewing Apex as{" "}
            <span className="break-all font-medium text-apex-on-surface">
              {impersonatedUserEmail() ?? "another user"}
            </span>
            .
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full", appOutlineButtonClassName)}
          disabled={busy}
          onClick={() => void stopImpersonating()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Stopping…" : "Stop impersonating"}
        </Button>
      </div>
    </SettingsSectionChrome>
  );
}
