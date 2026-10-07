import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronRight, PenLine, Upload, X, Zap } from "lucide-react";
import {
  getLogSessionMenuItems,
  type LogSessionMenuIcon,
  type LogSessionMenuItem,
} from "@/config/navigation";
import { usePlatform } from "@/hooks/usePlatform";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  appModalCloseButtonClassName,
  appModalDescriptionClassName,
  appModalOverlayClassName,
  appModalSheetTopRadiusClassName,
  appModalTitleClassName,
} from "@/components/app-ui/appModalStyles";

/** Loveable telemetry.html overrides `rounded-full` to 0.75rem — not a circle. */
const LOVEABLE_ICON_RADIUS = "rounded-[0.75rem]";

type LogSessionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function LogSessionMenuIcon({
  icon,
  featured,
}: {
  icon: LogSessionMenuIcon;
  featured?: boolean;
}) {
  const iconClassName = featured
    ? "size-[22px] fill-apex-primary text-apex-primary"
    : "size-[22px] text-apex-on-surface-variant";

  switch (icon) {
    case "agent":
      return <Zap className={iconClassName} aria-hidden />;
    case "manual":
      return <PenLine className={iconClassName} aria-hidden />;
    case "upload":
      return <Upload className={iconClassName} aria-hidden />;
  }
}

function LogSessionSheetRow({
  item,
  onSelect,
}: {
  item: LogSessionMenuItem;
  onSelect: (to: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.to)}
      className="group relative flex h-[76px] w-full cursor-pointer items-center border-b border-apex-outline-variant/15 px-6 text-left transition-colors hover:bg-apex-surface-container-high/50"
    >
      {item.featured ? (
        <div
          className="absolute inset-y-0 left-0 w-[2px] bg-apex-primary"
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center border",
          LOVEABLE_ICON_RADIUS,
          item.featured
            ? "border-apex-primary/20 bg-apex-primary/15"
            : "border-apex-outline-variant/20 bg-apex-surface-container-high",
        )}
      >
        <LogSessionMenuIcon icon={item.icon} featured={item.featured} />
      </div>

      <div className="ml-4 flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-apex-headline text-[15px] font-semibold text-apex-on-surface">
            {item.title}
          </span>
          {item.proBadge ? (
            <span className="rounded-apex-sm bg-apex-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              APEX PRO REQUIRED
            </span>
          ) : null}
        </div>
        <p className="truncate font-apex-body text-[12px] text-apex-on-surface-variant">
          {item.subtitle}
        </p>
      </div>

      <ChevronRight
        className="size-5 shrink-0 text-apex-on-surface-variant/40 transition-colors group-hover:text-apex-on-surface-variant"
        aria-hidden
      />
    </button>
  );
}

export default function LogSessionSheet({
  open,
  onOpenChange,
}: LogSessionSheetProps) {
  const navigate = useNavigate();
  const { isNative } = usePlatform();
  const items = getLogSessionMenuItems(isNative);

  const handleSelect = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <div className="apex-theme">
          <DialogPrimitive.Overlay
            className={cn(
              appModalOverlayClassName,
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-[80] mx-auto flex h-[58vh] w-full max-w-xl flex-col overflow-hidden",
              "pb-[max(2rem,env(safe-area-inset-bottom,0px))]",
              appModalSheetTopRadiusClassName,
              "border-t border-apex-outline-variant/15 bg-apex-background text-apex-on-surface",
              "[outline:none] focus:[outline:none] focus-visible:[outline:none]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
              "duration-300",
            )}
          >
            <div
              className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-apex-outline-variant/40"
              aria-hidden
            />

            <header className="mt-1 flex items-start justify-between p-4 px-6">
              <div className="flex flex-col">
                <DialogPrimitive.Title
                  className={cn(
                    appModalTitleClassName,
                    "text-[20px] leading-tight",
                  )}
                >
                  Log a Session
                </DialogPrimitive.Title>
                <DialogPrimitive.Description
                  className={cn(
                    appModalDescriptionClassName,
                    "mt-0.5 text-[13px]",
                  )}
                >
                  Choose how you want to record this session
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                type="button"
                className={cn(
                  appModalCloseButtonClassName,
                  "relative right-0 top-0 flex size-8 items-center justify-center",
                )}
                aria-label="Close"
              >
                <X className="size-6" aria-hidden />
              </DialogPrimitive.Close>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.map((item) => (
                <LogSessionSheetRow
                  key={item.id}
                  item={item}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
