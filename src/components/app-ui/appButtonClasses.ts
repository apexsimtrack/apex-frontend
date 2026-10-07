import { cn } from "@/lib/utils";

export const appPrimaryButtonClassName = cn(
  "rounded-apex-sm px-8 py-2.5 font-apex-headline text-sm font-bold uppercase tracking-widest",
  "bg-apex-primary text-white hover:bg-apex-primary/90",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

export const appSecondaryButtonClassName = cn(
  "rounded-apex-sm border border-apex-outline-variant/20 bg-apex-surface-container-highest",
  "font-apex-headline text-xs font-bold uppercase tracking-widest text-apex-on-surface",
  "hover:bg-apex-surface-container transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

export const appOutlineButtonClassName = cn(
  "rounded-apex-sm border border-apex-outline-variant/20 text-apex-on-surface",
  "hover:bg-apex-surface-container transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

/** Modal dismiss. Full outline token so the stroke stays visible on phone screens. */
export const appModalCancelButtonClassName = cn(
  "rounded-apex-sm border border-apex-outline-variant text-apex-on-surface",
  "hover:bg-apex-surface-container transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

export const appDestructiveButtonClassName = cn(
  "rounded-apex-sm bg-apex-primary font-apex-body text-sm font-bold text-white",
  "hover:bg-apex-primary/90 transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

export const appInputClassName =
  "w-full rounded-apex-sm border border-apex-outline-variant/20 bg-apex-surface-container-highest px-3 py-2 text-sm text-apex-on-surface shadow-none placeholder:text-apex-on-surface-variant/50 focus:border-apex-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50";

export const appSelectClassName = cn(
  "h-12 w-full appearance-none rounded-apex-sm",
  "border border-apex-outline-variant/20 bg-apex-surface-container-highest",
  "px-4 pr-10 font-apex-headline text-sm text-apex-on-surface",
  "focus:border-apex-primary focus:outline-none focus:ring-0",
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

/** Loveable manual-entry field radius (8px) — not project `rounded-lg` (16px from --radius). */
const LOVEABLE_FIELD_RADIUS = "rounded-[0.5rem]";

export const appManualInputClassName = cn(
  "h-12 w-full",
  LOVEABLE_FIELD_RADIUS,
  "border border-apex-outline-variant/40 bg-apex-surface-container",
  "px-4 font-apex-headline text-sm text-apex-on-surface",
  "placeholder:text-apex-on-surface-variant/50",
  "focus:border-apex-primary focus:outline-none focus:ring-0",
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const appManualSelectClassName = cn(
  appManualInputClassName,
  "appearance-none pr-10",
);

export const appManualTextareaClassName = cn(
  "w-full min-h-[7rem] resize-none p-4",
  LOVEABLE_FIELD_RADIUS,
  "border border-apex-outline-variant/40 bg-apex-surface-container",
  "text-sm text-apex-on-surface",
  "placeholder:text-apex-on-surface-variant/50",
  "focus:border-apex-primary focus:outline-none focus:ring-0",
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
  "disabled:opacity-50",
);

export const appAccountInputClassName =
  "w-full rounded-apex-sm border border-transparent bg-apex-surface-container-highest px-3 py-1 font-apex-headline text-lg font-bold text-apex-on-surface shadow-none placeholder:text-apex-on-surface-variant/50 focus:border-apex-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50 sm:text-xl";

export const appAccountFieldValueClassName =
  "font-apex-headline text-sm font-bold text-apex-on-surface break-words";

export const appDropdownContentClassName = cn(
  "z-[100] !rounded-md !border-[#484847]/65 !bg-[#0e0e0e] text-white shadow-md",
);

/** Default item hover — light red highlight (no bold/icon stroke). */
export const appDropdownItemClassName = cn(
  "cursor-pointer text-white/90",
  "focus:!bg-[#E10600]/15 focus:text-white",
  "data-[highlighted]:!bg-[#E10600]/15 data-[highlighted]:!font-normal data-[highlighted]:text-white",
);

export const appProfileDropdownContentClassName = cn(
  "apex-theme",
  appDropdownContentClassName,
  "!w-64",
);

/** Danger sign-out — red text, distinct hover surface. */
export const appDropdownDangerItemClassName = cn(
  "cursor-pointer text-[#ff6e84]",
  "focus:!bg-[#a70138]/20 focus:text-[#ff6e84]",
  "data-[highlighted]:!bg-[#a70138]/20 data-[highlighted]:!font-normal data-[highlighted]:text-[#ff6e84]",
);

export const appDropdownSeparatorClassName = "bg-[#484847]/20";

export const appDropdownEmailClassName =
  "truncate text-xs text-apex-on-surface-variant";

/** Loveable tertiary accent — download icons, highlights */
export const appTertiaryIconClassName = "text-[#8ff5ff]";

/** Loveable destructive account-action surface */
export const appDangerCardClassName = cn(
  "rounded-apex-lg border border-[#ff6e84]/20 bg-[#a70138]/10 p-6",
  "transition-colors hover:bg-[#a70138]/20",
);
