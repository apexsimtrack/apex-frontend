import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exitImpersonationSession } from "@/lib/api/impersonationAuth";
import { withRequestId } from "@/lib/api/errors";
import {
  hideImpersonationBanner,
  impersonatedUserEmail,
  isImpersonating,
  isImpersonationBannerHidden,
} from "@/lib/impersonation";

/**
 * Sticky in-flow banner while an admin is viewing the product as another user.
 */
export default function ImpersonationBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    bump((n) => n + 1);
  }, []);

  useEffect(() => {
    const onAuth = () => refresh();
    window.addEventListener("apex:auth", onAuth);
    window.addEventListener("apex:impersonation-banner", onAuth);
    return () => {
      window.removeEventListener("apex:auth", onAuth);
      window.removeEventListener("apex:impersonation-banner", onAuth);
    };
  }, [refresh]);

  const visible = isImpersonating() && !isImpersonationBannerHidden();
  const email = impersonatedUserEmail();

  useEffect(() => {
    const root = document.documentElement;
    const banner = bannerRef.current;
    if (!visible || !banner) {
      root.style.removeProperty("--apex-impersonation-banner-h");
      return;
    }

    const updateHeight = () => {
      root.style.setProperty(
        "--apex-impersonation-banner-h",
        `${banner.getBoundingClientRect().height}px`,
      );
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);

    return () => {
      observer.disconnect();
      root.style.removeProperty("--apex-impersonation-banner-h");
    };
  }, [visible]);

  const exit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await exitImpersonationSession();
      if (!ok) {
        toast.error(
          "Could not restore admin session. Sign out and sign in again.",
        );
        return;
      }
      // Match the start of impersonation: reload so no view keeps rendering the target's data.
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

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      className="sticky inset-x-0 top-0 z-[200] shrink-0 border-b border-amber-500/40 bg-amber-950/95 pt-[env(safe-area-inset-top)] text-amber-50 shadow-lg backdrop-blur-md"
      role="status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <p className="min-w-0 text-sm font-medium">
          You are currently impersonating{" "}
          <span className="break-all font-semibold">
            {email ?? "another user"}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void exit()}
          >
            {busy ? "Stopping…" : "Stop impersonating"}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-amber-100 hover:bg-amber-800/70 hover:text-white"
            aria-label="Hide impersonation banner"
            onClick={hideImpersonationBanner}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
