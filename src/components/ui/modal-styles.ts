import { cva, type VariantProps } from "class-variance-authority";

export const modalOverlayClassName =
  "fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

export const modalSurfaceVariants = cva(
  "fixed z-50 flex min-h-0 w-full flex-col gap-0 overflow-hidden border border-border bg-card text-card-foreground shadow-lg duration-200 [outline:none] focus:[outline:none] focus-visible:[outline:none] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  {
    variants: {
      size: {
        sm: "sm:max-w-md",
        md: "sm:max-w-lg",
        lg: "sm:max-w-xl",
        xl: "sm:max-w-2xl",
        "2xl": "sm:max-w-3xl",
        full: "sm:max-w-[min(72rem,calc(100vw-2rem))]",
      },
      mobileVariant: {
        // Leave ≥2rem + safe-area on each side so near-full panels clear the
        // notch and home indicator on phones.
        centered:
          "left-[50%] top-[50%] max-h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] translate-x-[-50%] translate-y-[-50%] rounded-lg data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        sheet:
          "inset-x-0 bottom-0 max-h-[calc(100dvh-1rem-env(safe-area-inset-top,0px))] rounded-t-[var(--radius)] data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:w-full sm:max-h-[calc(100dvh-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
        // Inset instead of true edge-to-edge so content never sits under the
        // status bar / home indicator. Desktop still centres as a dialog.
        fullscreen:
          "inset-x-0 top-[max(1rem,env(safe-area-inset-top,0px))] bottom-[max(1rem,env(safe-area-inset-bottom,0px))] h-auto max-h-none max-w-none rounded-lg data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full sm:left-[50%] sm:top-[50%] sm:right-auto sm:bottom-auto sm:h-auto sm:w-full sm:max-h-[calc(100dvh-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
      },
    },
    defaultVariants: {
      size: "md",
      mobileVariant: "centered",
    },
  },
);

export type ModalSurfaceVariantProps = VariantProps<
  typeof modalSurfaceVariants
>;
export type ModalSize = NonNullable<ModalSurfaceVariantProps["size"]>;
export type ModalMobileVariant = NonNullable<
  ModalSurfaceVariantProps["mobileVariant"]
>;

export const modalPanelClassName =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
export const modalHeaderClassName =
  "shrink-0 space-y-2 border-b border-border px-5 py-4 text-left sm:px-6";
/** Extra bottom padding so the last lines clear scrollbars / home indicator when scrolling. */
export const modalBodyClassName =
  "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-8";
export const modalFooterClassName =
  "shrink-0 flex flex-col-reverse gap-2 border-t border-border px-5 pb-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] pt-4 sm:flex-row sm:justify-end sm:px-6";
export const modalTitleClassName =
  "text-xl font-semibold leading-7 text-foreground";
export const modalDescriptionClassName =
  "text-sm leading-6 text-muted-foreground";
export const modalCloseButtonClassName =
  "absolute right-3 top-3 rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:pointer-events-none disabled:opacity-50";
