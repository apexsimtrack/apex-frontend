import { useState, useMemo, useRef, useEffect } from "react";
import {
  useForm,
  useFormState,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import type {
  ControllerRenderProps,
  FieldErrors,
  FieldPath,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, AlertCircle, Lock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MANUAL_ACTIVITY_SIMS,
  type ManualActivitySim,
} from "@/lib/manualActivityData";
import { parseStrictManualLapTimeToMs, formatMsToLapTime } from "@/lib/utils";
import { stripLapTimeChars, wholeNumberInputProps } from "@/lib/inputGuards";
import { useCatalogs } from "@/hooks/useCatalogs";
import {
  useRecentManualSessions,
  getRecentChipLabel,
  type RecentManualItem,
} from "@/hooks/useRecentManualSessions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRootMessage,
} from "@/components/ui/form";
import {
  fieldArrayErrorMessage,
  fieldErrorMessage,
  type WithRootError,
} from "@/lib/formWithRootError";
import {
  effectiveManualLapMaxForForm,
  MANUAL_ACTIVITY_POSITION_MAX,
  MANUAL_ACTIVITY_TOTAL_DRIVERS_MAX,
} from "@/lib/validation/manualActivity";
import type { ManualActivityRequest } from "@/lib/api/manualAndUpload";
import type { ManualActivityEditInitialData } from "@/lib/sessionEditInitialData";
import { useManualActivityFormSync } from "@/features/manual-activity/hooks/useManualActivityFormSync";
import {
  acceptSectorCountText,
  createManualActivityFormSchema,
  isValidSectorTimeFormat,
  parseSectorCountInput,
  parseSectorTimeToMs,
  MANUAL_CONDITIONS,
  type ManualActivityFormValues,
} from "./manualActivitySchema";
import AppNativeSelect from "@/components/app-ui/AppNativeSelect";
import CatalogPicker from "@/components/catalog/CatalogPicker";
import {
  appManualInputClassName,
  appManualTextareaClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";

// Loveable "Manual Entry" (loveable-ui/public/screens/manual-entry.html) styling
// mapped to apex tokens: apex-red = --apex-primary, brand-card ≈ surface-container,
// Space Grotesk = font-apex-headline. Labels are tiny uppercase Space Grotesk.
const LABEL_CLASS =
  "mb-2 block font-apex-headline text-[11px] font-bold uppercase tracking-wider text-apex-on-surface-variant";

const SECTION_LABEL_CLASS =
  "font-apex-headline text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant";

const INPUT_CLASS = appManualInputClassName;

// Loveable pill: bordered, uppercase, red-tinted (not solid) when active.
function pillClass(active: boolean): string {
  return cn(
    "rounded-[0.5rem] border py-3 font-apex-headline text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50",
    active
      ? "border-apex-primary bg-apex-primary/10 text-apex-on-surface"
      : "border-apex-outline-variant/40 bg-apex-surface-container text-apex-on-surface-variant hover:border-apex-outline-variant hover:text-apex-on-surface",
  );
}

const SESSION_KIND_OPTIONS = [
  { value: "PRACTICE" as const, label: "Practice" },
  { value: "QUALIFY" as const, label: "Qualifying" },
  { value: "RACE" as const, label: "Race" },
];

// Borderless monospace input — Loveable lap table: only the time text is visible.
const CELL_INPUT_CLASS =
  "manual-lap-cell !m-0 !h-auto !min-h-0 !w-full !min-w-0 !appearance-none !border-0 !bg-transparent !p-0 text-center font-mono text-xs !shadow-none !outline-none !ring-0 [color-scheme:dark] placeholder:text-apex-outline-variant/60 focus:!border-0 focus:!bg-transparent focus:!shadow-none focus:!outline-none focus:!ring-0 focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none focus-visible:!outline-none focus-visible:!ring-0 disabled:opacity-50";

const CELL_SECTOR_CLASS = "manual-lap-cell-sector text-apex-on-surface-variant";

/** Total colour tracks the entered value: neutral until typed, green once it parses. */
const CELL_TOTAL_EMPTY_CLASS =
  "manual-lap-cell-total-empty text-apex-on-surface-variant/60";
const CELL_TOTAL_VALID_CLASS = "manual-lap-cell-total-valid text-apex-success";

type LapFieldPath = FieldPath<WithRootError<ManualActivityFormValues>>;

/**
 * Always an `<input>` — an earlier version swapped in a `<button>` once the cell
 * had a value, which unmounted the input mid-edit and dropped focus whenever the
 * value changed from outside (sector auto-fill, re-validation).
 */
function LapTableCellField({
  field,
  displayClassName,
  placeholder,
  ariaLabel,
  disabled,
  align = "center",
  invalid = false,
  onUserChange,
}: {
  field: ControllerRenderProps<
    WithRootError<ManualActivityFormValues>,
    LapFieldPath
  >;
  displayClassName: string;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  align?: "center" | "right";
  invalid?: boolean;
  onUserChange?: () => void;
}) {
  const value = String(field.value ?? "");

  return (
    <input
      {...field}
      value={value}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        CELL_INPUT_CLASS,
        disabled &&
          "cursor-not-allowed text-apex-on-surface-variant/40 placeholder:text-apex-on-surface-variant/30",
        align === "right" && "text-right font-bold",
        invalid ? "manual-lap-cell-invalid text-apex-error" : displayClassName,
      )}
      onChange={(e) => {
        const cleaned = stripLapTimeChars(e.target.value);
        if (cleaned !== e.target.value) e.target.value = cleaned;
        field.onChange(e);
        onUserChange?.();
      }}
    />
  );
}

function FormBlock({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 rounded-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-4 sm:p-5",
        className,
      )}
    >
      <header className="mb-4 border-b border-apex-outline-variant/10 pb-3">
        <h3 className={SECTION_LABEL_CLASS}>{title}</h3>
        {description ? (
          <p className="mt-1.5 text-xs leading-relaxed text-apex-on-surface-variant">
            {description}
          </p>
        ) : null}
      </header>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** Below Tailwind's `sm`, the six-column lap table squashes sector and total times. */
function useStackedLapLayout(): boolean {
  const [stacked, setStacked] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setStacked(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return stacked;
}

type FormIssue = { name: string; message: string };

/** Reading order, so the toast quotes and scrolls to the topmost problem. */
const FIELD_ORDER = [
  "sim",
  "trackId",
  "carId",
  "manualSessionKind",
  "position",
  "totalDrivers",
  "qualifyingPosition",
  "sectorCount",
  "laps",
  "caption",
] as const;

/** Scroll targets for controls whose element id differs from the field name. */
const FIELD_SCROLL_TARGET_ID: Record<string, string> = {
  sim: "sim",
  trackId: "track",
  carId: "car",
  manualSessionKind: "manual-session-details",
  laps: "manual-lap-history",
};

/**
 * Flatten react-hook-form errors into ordered, human-readable issues. `laps` can
 * hold both a root message and per-row cell errors, so both shapes are read.
 */
function collectFormIssues(
  errors: FieldErrors<WithRootError<ManualActivityFormValues>>,
): FormIssue[] {
  const issues: FormIssue[] = [];

  for (const name of FIELD_ORDER) {
    if (name !== "laps") {
      const message = fieldErrorMessage(errors[name]);
      if (message) issues.push({ name, message });
      continue;
    }

    const lapErrors = errors.laps as unknown;
    if (!lapErrors || typeof lapErrors !== "object") continue;

    const rootMessage = fieldArrayErrorMessage(lapErrors);
    if (rootMessage) issues.push({ name: "laps", message: rootMessage });

    for (const [key, rowError] of Object.entries(
      lapErrors as Record<string, unknown>,
    )) {
      const index = Number(key);
      if (!Number.isInteger(index) || !rowError || typeof rowError !== "object")
        continue;
      for (const cell of ["lapTime", "sectors"] as const) {
        const message = fieldErrorMessage(
          (rowError as Record<string, unknown>)[cell],
        );
        if (message) {
          issues.push({
            name: `laps.${index}.${cell}`,
            message: `Lap ${index + 1}: ${message}`,
          });
        }
      }
    }
  }

  return issues;
}

// Duplicated verbatim from V1 ManualActivityForm (pure catalog-token resolvers).
// Keep in sync with shared manual-activity form helpers where fields overlap.
function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

function resolveCatalogTrackId(
  catalog: { id: string; name: string }[],
  storedToken: string,
  nameHint: string | null | undefined,
): string {
  const token = storedToken?.trim();
  if (token && catalog.some((t) => t.id === token)) return token;
  if (token) {
    const byTokenAsName = catalog.find(
      (t) => normLabel(t.name) === normLabel(token),
    );
    if (byTokenAsName) return byTokenAsName.id;
  }
  const h = nameHint?.trim();
  if (!h) return "";
  const nh = normLabel(h);
  const exact = catalog.find((t) => normLabel(t.name) === nh);
  if (exact) return exact.id;
  const partial = catalog.find(
    (t) => nh.includes(normLabel(t.name)) || normLabel(t.name).includes(nh),
  );
  return partial?.id ?? "";
}

function resolveCatalogCarId(
  catalog: { id: string; name: string }[],
  storedToken: string,
  nameHint: string | null | undefined,
): string {
  const token = storedToken?.trim();
  if (token && catalog.some((c) => c.id === token)) return token;
  if (token) {
    const byTokenAsName = catalog.find(
      (c) => normLabel(c.name) === normLabel(token),
    );
    if (byTokenAsName) return byTokenAsName.id;
  }
  const h = nameHint?.trim();
  if (!h) return "";
  const nh = normLabel(h);
  const exact = catalog.find((c) => normLabel(c.name) === nh);
  if (exact) return exact.id;
  const partial = catalog.find(
    (c) => nh.includes(normLabel(c.name)) || normLabel(c.name).includes(nh),
  );
  return partial?.id ?? "";
}

function formatMsToInput(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  return formatMsToLapTime(ms);
}

function buildDefaults(
  initial?: ManualActivityEditInitialData,
): ManualActivityFormValues {
  let laps: ManualActivityFormValues["laps"];
  if (initial?.lapsMs && initial.lapsMs.length > 0) {
    laps = initial.lapsMs.map((ms, index) => {
      const sectors = initial.lapsSectorsMs?.[index] ?? null;
      const count = initial.sectorCount ?? sectors?.sectorTimesMs?.length ?? 3;
      const values =
        sectors?.sectorTimesMs ??
        [sectors?.sector1Ms ?? null, sectors?.sector2Ms ?? null, sectors?.sector3Ms ?? null];
      return {
        lapTime: formatMsToInput(ms),
        sectors: Array.from({ length: count }, (_, i) => formatMsToInput(values[i])),
      };
    });
  } else if (initial?.bestLapMs != null && Number.isFinite(initial.bestLapMs)) {
    laps = [
      {
        lapTime: formatMsToInput(initial.bestLapMs),
        sectors: Array.from({ length: initial.sectorCount ?? 3 }, () => ""),
      },
    ];
  } else {
    laps = [{ lapTime: "", sectors: ["", "", ""] }];
  }
  const kindRaw = initial?.manualSessionKind?.trim().toUpperCase();
  const manualSessionKind =
    kindRaw === "PRACTICE" || kindRaw === "QUALIFY" || kindRaw === "RACE"
      ? kindRaw
      : "RACE";

  return {
    sim: (initial?.sim as string) || "",
    trackId: initial?.catalogTrackId ?? initial?.trackId ?? "",
    carId: initial?.catalogCarId ?? initial?.carId ?? "",
    manualSessionKind,
    position: initial?.position != null ? String(initial.position) : "",
    totalDrivers:
      initial?.totalDrivers != null ? String(initial.totalDrivers) : "",
    qualifyingPosition:
      initial?.qualifyingPosition != null
        ? String(initial.qualifyingPosition)
        : "",
    sectorCount: String(initial?.sectorCount ?? 3),
    laps,
    caption: initial?.caption ?? "",
    conditions:
      initial?.conditions === "DRY" ||
      initial?.conditions === "WET" ||
      initial?.conditions === "MIXED"
        ? initial.conditions
        : "DRY",
  };
}

interface ManualActivityFormProps {
  initialData?: ManualActivityEditInitialData;
  hideRecentSessions?: boolean;
  onSubmit: (data: ManualActivityRequest) => Promise<void>;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export default function ManualActivityForm({
  initialData,
  hideRecentSessions = false,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting,
  errorMessage,
}: ManualActivityFormProps) {
  const telemetryMinLapRows = initialData?.telemetryMinLapRows ?? null;
  /** Uploaded/agent sessions own their lap rows; only manual entries add or drop laps. */
  const lapRowsLocked = initialData?.lapRowsLocked === true;
  const lapsIsOutLap = initialData?.lapsIsOutLap ?? null;
  const lapsCanEditOutLap = initialData?.lapsCanEditOutLap ?? null;
  const activitySchema = useMemo(
    () => createManualActivityFormSchema(telemetryMinLapRows),
    [telemetryMinLapRows],
  );

  const [pendingRecent, setPendingRecent] = useState<{
    trackToken: string;
    trackName: string;
    carToken: string;
    carName: string;
  } | null>(null);

  const form = useForm<WithRootError<ManualActivityFormValues>>({
    resolver: zodResolver(activitySchema),
    defaultValues: buildDefaults(initialData),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "laps",
  });

  const formState = useFormState({ control: form.control });
  const stackedLapLayout = useStackedLapLayout();

  const sim = form.watch("sim") as ManualActivitySim | "";
  const watchedSectorCount = String(form.watch("sectorCount") ?? "");
  const parsedSectorCount = parseSectorCountInput(watchedSectorCount);
  // An emptied field keeps the previous columns until a new 0–64 count is entered.
  const lastValidSectorCountRef = useRef(parsedSectorCount ?? 3);
  if (parsedSectorCount != null) lastValidSectorCountRef.current = parsedSectorCount;
  const sectorCount = parsedSectorCount ?? lastValidSectorCountRef.current;
  const sessionKind = form.watch("manualSessionKind");
  const conditions = form.watch("conditions");
  const lapsWatch = useWatch({ control: form.control, name: "laps" });

  const formRef = useRef<HTMLFormElement | null>(null);

  /** Rows whose Total the user typed by hand — sector auto-fill leaves these alone. */
  const userEditedTotalsRef = useRef<Set<number>>(new Set());
  /** Rows whose Total this form filled in, and may therefore clear again. */
  const autoFilledTotalsRef = useRef<Set<number>>(new Set());

  // A reset from challenge/prefill must not leave stale marks against new rows.
  useEffect(() => {
    userEditedTotalsRef.current = new Set();
    autoFilledTotalsRef.current = new Set();
  }, [initialData]);

  /**
   * Keep Total in step with all configured sectors as they are typed. Only ever
   * touches a Total this form filled in, so a hand-typed or prefilled value
   * survives until the sectors themselves produce a complete lap.
   */
  function syncTotalFromSectors(index: number) {
    if (userEditedTotalsRef.current.has(index)) return;
    const row = form.getValues(`laps.${index}`);
    if (!row) return;

    const parsed = row.sectors.map((value) => parseSectorTimeToMs(value ?? ""));
    const current = row.lapTime ?? "";
    const complete = parsed.length > 0 && parsed.every((value) => value != null);

    if (!complete && !autoFilledTotalsRef.current.has(index)) return;

    const next = complete
      ? formatMsToLapTime((parsed as number[]).reduce((sum, value) => sum + value, 0))
      : "";
    if (complete) autoFilledTotalsRef.current.add(index);
    else autoFilledTotalsRef.current.delete(index);

    if (current === next) return;
    form.setValue(`laps.${index}.lapTime`, next, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
  }

  function revalidateResultFields() {
    if (!form.formState.isSubmitted) return;
    void form.trigger(["position", "totalDrivers", "qualifyingPosition"]);
  }

  function scrollToField(name: string) {
    const root = formRef.current;
    if (!root) return;
    const targetId = FIELD_SCROLL_TARGET_ID[name];
    const el =
      root.querySelector<HTMLElement>(`[name="${name}"]`) ??
      (targetId ? root.querySelector<HTMLElement>(`#${targetId}`) : null) ??
      (targetId ? null : root.querySelector<HTMLElement>(`#${name}`));
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      el.focus({ preventScroll: true });
    }
  }

  /** Failed submits are otherwise silent when the offending field is off-screen. */
  function handleInvalid(
    errors: FieldErrors<WithRootError<ManualActivityFormValues>>,
  ) {
    const issues = collectFormIssues(errors);
    const first = issues[0];
    const extra = issues.length - 1;
    toast.error(
      issues.length > 1
        ? `${issues.length} things need fixing before saving`
        : "One thing needs fixing before saving",
      {
        description: first
          ? extra > 0
            ? `${first.message} (and ${extra} more)`
            : first.message
          : undefined,
      },
    );
    if (first) scrollToField(first.name);
  }

  const maxLapsForSim = effectiveManualLapMaxForForm(
    sim || "",
    telemetryMinLapRows ?? null,
  );
  const canAddLap = fields.length < maxLapsForSim && !lapRowsLocked;
  const canRemoveLap = fields.length > 1 && !lapRowsLocked;

  function removeLap(index: number) {
    const shiftPastRemoved = (marks: Set<number>) => {
      const next = new Set<number>();
      for (const i of marks) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    };
    userEditedTotalsRef.current = shiftPastRemoved(userEditedTotalsRef.current);
    autoFilledTotalsRef.current = shiftPastRemoved(autoFilledTotalsRef.current);
    remove(index);
  }

  function changeSectorCount(nextCount: number): boolean {
    if (initialData?.sectorLayoutLocked) return false;
    const currentCount = sectorCount;
    if (
      nextCount < currentCount &&
      form
        .getValues("laps")
        .some((row) =>
          row.sectors
            .slice(nextCount)
            .some((value) => String(value ?? "").trim()),
        )
    ) {
      if (!window.confirm("Reducing the sector count will discard removed sector values. Continue?")) {
        return false;
      }
    }
    form.setValue("sectorCount", String(nextCount), { shouldDirty: true, shouldValidate: true });
    form.getValues("laps").forEach((row, index) => {
      form.setValue(
        `laps.${index}.sectors`,
        Array.from({ length: nextCount }, (_, sectorIndex) => row.sectors[sectorIndex] ?? ""),
        { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
      );
      syncTotalFromSectors(index);
    });
    return true;
  }

  const {
    tracks,
    cars,
    loading: catalogsLoading,
    error: catalogsError,
    retry: retryCatalogs,
  } = useCatalogs(sim || null);
  const { recent: recentItems, loading: recentLoading } =
    useRecentManualSessions({ enabled: !hideRecentSessions });

  useManualActivityFormSync({
    initialData,
    errorMessage,
    form,
    sim,
    telemetryMinLapRows,
    tracks,
    cars,
    pendingRecent,
    setPendingRecent,
    buildDefaults,
    resolveCatalogTrackId,
    resolveCatalogCarId,
  });

  function handleRecentChipClick(item: RecentManualItem) {
    const currentSim = form.getValues("sim");
    if (currentSim !== item.sim) {
      form.setValue("sim", item.sim);
      form.setValue("trackId", "");
      form.setValue("carId", "");
    }
    setPendingRecent({
      trackToken: item.trackId,
      trackName: item.trackName,
      carToken: item.carId ?? "",
      carName: item.carName ?? "—",
    });
  }

  async function handleValid(values: ManualActivityFormValues) {
    form.clearErrors("root");
    const positionNum = values.position.trim()
      ? parseInt(values.position, 10)
      : undefined;
    const totalDriversNum = values.totalDrivers.trim()
      ? parseInt(values.totalDrivers, 10)
      : undefined;

    const lapsOut = values.laps
      .map((r) => {
        const lapTimeMs = parseStrictManualLapTimeToMs(r.lapTime.trim());
        if (lapTimeMs == null) return null;
        return {
          lapTimeMs,
          sectorTimesMs: r.sectors.map(parseSectorTimeToMs),
        };
      })
      .filter(
        (
          row,
        ): row is {
          lapTimeMs: number;
          sectorTimesMs: (number | null)[];
        } => row != null,
      );

    const kind = values.manualSessionKind.trim().toUpperCase() as
      | "PRACTICE"
      | "QUALIFY"
      | "RACE";
    const qualiNum = values.qualifyingPosition.trim()
      ? parseInt(values.qualifyingPosition, 10)
      : undefined;

    await onSubmit({
      sim: values.sim,
      trackId: values.trackId,
      manualSessionKind: kind,
      carId: values.carId || undefined,
      position: kind === "PRACTICE" ? undefined : positionNum,
      totalDrivers: kind === "PRACTICE" ? undefined : totalDriversNum,
      qualifyingPosition:
        kind === "RACE" && qualiNum !== undefined && Number.isFinite(qualiNum)
          ? qualiNum
          : undefined,
      laps: lapsOut,
      sectorCount,
      caption: values.caption.trim(),
      conditions: values.conditions,
    });
  }

  const showRecent = !recentLoading && recentItems.length > 0;
  const showRecentSection =
    !hideRecentSessions && (recentLoading || showRecent);

  const lapRows = fields.map((fieldItem, index) => {
    const row = lapsWatch?.[index];
    const isOutLap = lapsIsOutLap?.[index] === true;
    const lockedOutLap = isOutLap && lapsCanEditOutLap?.[index] !== true;
    const rawTotal = (row?.lapTime ?? "").trim();
    const totalMs = rawTotal ? parseStrictManualLapTimeToMs(rawTotal) : null;

    return {
      key: fieldItem.id,
      index,
      isOutLap,
      lockedOutLap,
      totalInvalid: !lockedOutLap && rawTotal !== "" && totalMs === null,
      totalValid: !lockedOutLap && totalMs !== null,
      sectors: Array.from({ length: sectorCount }, (_, sectorIndex) => {
        const raw = (row?.sectors?.[sectorIndex] ?? "").trim();
        return {
          index: sectorIndex,
          invalid: !lockedOutLap && raw !== "" && !isValidSectorTimeFormat(raw),
        };
      }),
    };
  });

  function renderOutLapBadge(isOutLap: boolean, lockedOutLap: boolean) {
    if (!isOutLap) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-apex-body text-[9px] font-semibold uppercase tracking-wider",
          lockedOutLap
            ? "text-apex-on-surface-variant/60"
            : "text-apex-on-surface-variant",
        )}
        title={
          lockedOutLap
            ? "Locked: sectors and driving telemetry are incomplete"
            : "Editable: sectors and driving telemetry are available"
        }
      >
        {lockedOutLap ? <Lock className="size-2.5" aria-hidden /> : null}
        {lockedOutLap ? "Out · Locked" : "Out"}
      </span>
    );
  }

  function renderSectorField(
    index: number,
    sectorIndex: number,
    options: { disabled: boolean; invalid: boolean },
  ) {
    return (
      <FormField
        control={form.control}
        name={`laps.${index}.sectors.${sectorIndex}`}
        render={({ field }) => (
          <LapTableCellField
            field={field}
            displayClassName={CELL_SECTOR_CLASS}
            placeholder="--.---"
            ariaLabel={`Lap ${index + 1} sector ${sectorIndex + 1}`}
            disabled={options.disabled}
            invalid={options.invalid}
            onUserChange={() => syncTotalFromSectors(index)}
          />
        )}
      />
    );
  }

  function renderTotalField(
    index: number,
    options: {
      disabled: boolean;
      invalid: boolean;
      valid: boolean;
      align?: "center" | "right";
    },
  ) {
    return (
      <FormField
        control={form.control}
        name={`laps.${index}.lapTime`}
        render={({ field }) => (
          <LapTableCellField
            field={field}
            displayClassName={
              options.valid ? CELL_TOTAL_VALID_CLASS : CELL_TOTAL_EMPTY_CLASS
            }
            placeholder="0:00.000"
            ariaLabel={`Lap ${index + 1} total time`}
            disabled={options.disabled}
            align={options.align ?? "right"}
            invalid={options.invalid}
            onUserChange={() => {
              // Emptying Total by hand hands control back to the sectors.
              const raw = String(
                form.getValues(`laps.${index}.lapTime`) ?? "",
              ).trim();
              if (raw) userEditedTotalsRef.current.add(index);
              else userEditedTotalsRef.current.delete(index);
            }}
          />
        )}
      />
    );
  }

  function renderAddLapButton(className: string) {
    if (lapRowsLocked) return null;
    return (
      <button
        type="button"
        disabled={isSubmitting || !canAddLap}
        onClick={() =>
          append({
            lapTime: "",
            sectors: Array.from({ length: sectorCount }, () => ""),
          })
        }
        className={cn(
          className,
          "font-apex-headline text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant transition-colors hover:text-apex-on-surface disabled:opacity-40",
        )}
      >
        <Plus className="size-4" aria-hidden />
        Add lap
      </button>
    );
  }

  const lapHistoryDescription = lapRowsLocked
    ? lapsIsOutLap?.some(Boolean)
      ? "These laps come from the recorded session, so rows cannot be added or removed. Out laps are editable only when all sectors and driving telemetry are available."
      : "These laps come from the recorded session, so rows cannot be added or removed. You can still correct the recorded times."
    : "Add at least one valid lap time. Sector splits are optional.";

  const lapsRootMessage = fieldArrayErrorMessage(formState.errors.laps);

  // The position/grid-size rule is cross-field but attaches to `position` only,
  // so both inputs are re-checked together — otherwise clearing one input leaves
  // the other's message stranded.
  const resultMessages = Array.from(
    new Set(
      [
        fieldErrorMessage(form.getFieldState("position", formState).error),
        fieldErrorMessage(form.getFieldState("totalDrivers", formState).error),
      ].filter((message): message is string => message != null),
    ),
  );

  return (
    <Form {...form}>
      <form
        ref={formRef}
        onSubmit={form.handleSubmit(handleValid, handleInvalid)}
        className="space-y-5"
      >
        {showRecentSection && (
          <section className="mb-2">
            <h2 className={SECTION_LABEL_CLASS}>Recent Combos</h2>
            {recentLoading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-apex-on-surface-variant">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Loading recent sessions…
              </p>
            )}
            {showRecent && (
              <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto">
                {recentItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleRecentChipClick(item)}
                    disabled={isSubmitting}
                    title={getRecentChipLabel(item)}
                    className="whitespace-nowrap rounded-full border border-apex-outline-variant/40 bg-apex-surface-container px-4 py-2 font-apex-headline text-xs font-medium text-apex-on-surface transition-colors hover:border-apex-primary disabled:opacity-50"
                  >
                    {getRecentChipLabel(item)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <FormBlock
          id="manual-session-details"
          title="Session details"
          description="Choose your sim, track, and session type."
        >
          <FormField
            control={form.control}
            name="sim"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="sim" className={LABEL_CLASS}>
                  Sim / Game <span className="text-apex-primary">*</span>
                </FormLabel>
                <FormControl>
                  <AppNativeSelect
                    id="sim"
                    value={field.value}
                    onChange={(e) => {
                      const v = e.target.value;
                      field.onChange(v);
                      if (v === "F1_25" || v === "LMU") changeSectorCount(3);
                      form.setValue("trackId", "");
                      form.setValue("carId", "");
                      setPendingRecent(null);
                    }}
                    disabled={isSubmitting}
                  >
                    <option value="">Select sim…</option>
                    {MANUAL_ACTIVITY_SIMS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </AppNativeSelect>
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />

          {catalogsError && sim && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-apex-error/20 bg-apex-error/10 p-3">
              <p className="text-sm text-apex-error">{catalogsError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retryCatalogs}
                className="border-apex-outline-variant/40 bg-transparent text-apex-on-surface hover:bg-apex-surface-container-high"
              >
                Retry
              </Button>
            </div>
          )}

          <FormField
            control={form.control}
            name="trackId"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="track" className={LABEL_CLASS}>
                  Track <span className="text-apex-primary">*</span>
                  {catalogsLoading && sim && (
                    <span className="ml-2 font-normal normal-case tracking-normal text-apex-on-surface-variant">
                      <Loader2 className="mr-0.5 inline size-3 animate-spin align-middle" />
                      Loading…
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <CatalogPicker
                    id="track"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={tracks}
                    label="Track"
                    placeholder={
                      !sim
                        ? "Select a sim first"
                        : catalogsLoading
                          ? "Loading…"
                          : "Select track…"
                    }
                    disabled={isSubmitting || !sim || catalogsLoading}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="carId"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="car" className={LABEL_CLASS}>
                  Car{" "}
                  <span className="normal-case text-apex-on-surface-variant/70">
                    (optional)
                  </span>
                  {catalogsLoading && sim && (
                    <span className="ml-2 font-normal normal-case tracking-normal text-apex-on-surface-variant">
                      <Loader2 className="mr-0.5 inline size-3 animate-spin align-middle" />
                      Loading…
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <CatalogPicker
                    id="car"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={cars}
                    label="Car"
                    placeholder={
                      !sim
                        ? "Select a sim first"
                        : catalogsLoading
                          ? "Loading…"
                          : "Select car…"
                    }
                    allowClear
                    disabled={isSubmitting || !sim || catalogsLoading}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualSessionKind"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL_CLASS}>
                  Session type <span className="text-apex-primary">*</span>
                </FormLabel>
                <FormControl>
                  <div
                    className="grid grid-cols-3 gap-2"
                    role="group"
                    aria-label="Session type"
                  >
                    {SESSION_KIND_OPTIONS.map((option) => {
                      const active = (field.value || "RACE") === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => field.onChange(option.value)}
                          className={pillClass(active)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="conditions"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL_CLASS}>Conditions</FormLabel>
                <FormControl>
                  <div
                    className="grid grid-cols-3 gap-2"
                    role="group"
                    aria-label="Track conditions"
                  >
                    {MANUAL_CONDITIONS.map((option) => {
                      const active = (conditions || "DRY") === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => field.onChange(option.value)}
                          className={pillClass(active)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
        </FormBlock>

        <FormBlock
          title="Results"
          description={
            sessionKind === "PRACTICE"
              ? "Finishing position is not used for practice sessions."
              : "Optional — helps track wins, podiums, and grid position."
          }
        >
          <div className={sessionKind === "PRACTICE" ? "opacity-60" : ""}>
            <span className={LABEL_CLASS}>
              {sessionKind === "QUALIFY"
                ? "Qualifying position"
                : sessionKind === "RACE"
                  ? "Race finish"
                  : "Finishing position"}{" "}
              <span className="normal-case text-apex-on-surface-variant/70">
                ({sessionKind === "PRACTICE" ? "not used" : "optional"})
              </span>
            </span>
            {/* Errors render below the grid, not inside a cell, so a message
                appearing never changes a row's height and shifts the inputs. */}
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] sm:items-center sm:gap-2">
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormControl>
                      <input
                        id="position"
                        type="number"
                        min={1}
                        max={MANUAL_ACTIVITY_POSITION_MAX}
                        inputMode="numeric"
                        disabled={isSubmitting || sessionKind === "PRACTICE"}
                        placeholder="7"
                        className={INPUT_CLASS}
                        {...wholeNumberInputProps}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          revalidateResultFields();
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <span className="font-apex-headline text-[11px] font-bold uppercase tracking-wider text-apex-on-surface-variant sm:text-center">
                of
              </span>
              <div className="flex items-center gap-2">
                <FormField
                  control={form.control}
                  name="totalDrivers"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-0">
                      <FormControl>
                        <input
                          id="totalDrivers"
                          type="number"
                          min={1}
                          max={MANUAL_ACTIVITY_TOTAL_DRIVERS_MAX}
                          inputMode="numeric"
                          disabled={isSubmitting || sessionKind === "PRACTICE"}
                          placeholder="20"
                          className={INPUT_CLASS}
                          {...wholeNumberInputProps}
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            revalidateResultFields();
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <span className="shrink-0 font-apex-headline text-[11px] font-bold uppercase tracking-wider text-apex-on-surface-variant">
                  drivers
                </span>
              </div>
            </div>
            {resultMessages.length > 0 && (
              <div className="mt-2 space-y-1">
                {resultMessages.map((message) => (
                  <p key={message} className="text-xs text-apex-error">
                    {message}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-apex-on-surface-variant/60">
              {sessionKind === "PRACTICE"
                ? "Practice sessions do not use finishing position."
                : sessionKind === "QUALIFY"
                  ? "Your position after qualifying. Leave empty if unknown."
                  : "Your race result. Leave empty if unknown."}
            </p>
          </div>

          {sessionKind === "RACE" && (
            <div>
              <span className={LABEL_CLASS}>
                Qualifying position{" "}
                <span className="normal-case text-apex-on-surface-variant/70">
                  (optional)
                </span>
              </span>
              <FormField
                control={form.control}
                name="qualifyingPosition"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input
                        id="qualifyingPosition"
                        type="number"
                        min={1}
                        max={MANUAL_ACTIVITY_POSITION_MAX}
                        inputMode="numeric"
                        disabled={isSubmitting}
                        placeholder="e.g. 3"
                        className={cn(INPUT_CLASS, "max-w-xs")}
                        {...wholeNumberInputProps}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          revalidateResultFields();
                        }}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-apex-error" />
                  </FormItem>
                )}
              />
              <p className="mt-2 text-[11px] text-apex-on-surface-variant/60">
                Where you started on the grid (from qualifying).
              </p>
            </div>
          )}
        </FormBlock>

        <FormBlock
          id="manual-lap-history"
          title="Lap history"
          description={lapHistoryDescription}
        >
          {sim === "IRACING" && (
            <FormField
              control={form.control}
              name="sectorCount"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel htmlFor="sectorCount" className={LABEL_CLASS}>
                    Sectors per lap
                  </FormLabel>
                  <FormControl>
                    <input
                      {...field}
                      id="sectorCount"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={2}
                      disabled={
                        isSubmitting ||
                        initialData?.sectorLayoutLocked === true
                      }
                      className={INPUT_CLASS}
                      onChange={(event) => {
                        const current = String(field.value ?? "");
                        const next = acceptSectorCountText(event.target.value);
                        if (next == null) {
                          event.target.value = current;
                          return;
                        }
                        if (next === "") {
                          field.onChange("");
                          return;
                        }
                        if (!changeSectorCount(Number(next))) {
                          event.target.value = current;
                        }
                      }}
                      onBlur={() => {
                        field.onBlur();
                        if (
                          parseSectorCountInput(
                            String(form.getValues("sectorCount") ?? ""),
                          ) == null
                        ) {
                          form.setValue(
                            "sectorCount",
                            String(lastValidSectorCountRef.current),
                            {
                              shouldDirty: true,
                              shouldValidate: form.formState.isSubmitted,
                            },
                          );
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage className="text-xs text-apex-error" />
                  <p className="text-[11px] text-apex-on-surface-variant/60">
                    {initialData?.sectorLayoutLocked
                      ? "Recorded telemetry layout cannot be changed."
                      : "Use 0 for no sector data, or 1–64."}
                  </p>
                </FormItem>
              )}
            />
          )}
          {stackedLapLayout ? (
            // Phone: one card per lap. The six-column table cannot fit sector and
            // total times side by side at this width without squashing them.
            <div className="space-y-3">
              {lapRows.map((lap) => (
                <div
                  key={lap.key}
                  className={cn(
                    "rounded-xl border border-apex-outline-variant/30 bg-apex-surface-container p-3",
                    lap.lockedOutLap &&
                      "border-l-2 border-l-apex-outline-variant/60 bg-apex-surface-container-high/70",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-apex-headline text-sm font-bold text-apex-on-surface">
                      Lap {String(lap.index + 1).padStart(2, "0")}
                      {renderOutLapBadge(lap.isOutLap, lap.lockedOutLap)}
                    </span>
                    {canRemoveLap && (
                      <button
                        type="button"
                        disabled={isSubmitting || lap.lockedOutLap}
                        onClick={() => removeLap(lap.index)}
                        aria-label={`Remove lap ${lap.index + 1}`}
                        className="p-1 text-apex-on-surface-variant transition-colors hover:text-apex-error disabled:opacity-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {lap.sectors.map((sector) => (
                      <div
                        key={sector.index}
                        className="rounded-lg border border-apex-outline-variant/20 bg-apex-surface-container-low px-2 py-1.5"
                      >
                        <span className="mb-1 block text-center font-apex-headline text-[9px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
                          S{sector.index + 1}
                        </span>
                        {renderSectorField(lap.index, sector.index, {
                          disabled: isSubmitting || lap.lockedOutLap,
                          invalid: sector.invalid,
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center gap-3 rounded-lg border border-apex-outline-variant/20 bg-apex-surface-container-low px-2.5 py-2">
                    <span className="shrink-0 font-apex-headline text-[9px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
                      Total
                    </span>
                    <div className="min-w-0 flex-1">
                      {renderTotalField(lap.index, {
                        disabled: isSubmitting || lap.lockedOutLap,
                        invalid: lap.totalInvalid,
                        valid: lap.totalValid,
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {renderAddLapButton(
                "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-apex-outline-variant/40 py-3",
              )}
            </div>
          ) : (
            /* Loveable-style monospace lap table: Lap | S1 | S2 | S3 | Total. */
            <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-apex-outline-variant/30 bg-apex-surface-container">
              <table className="w-max min-w-full border-collapse text-left">
                <thead className="border-b border-apex-outline-variant/30 bg-white/5">
                  <tr className="font-apex-headline text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
                    <th className="sticky left-0 z-20 min-w-20 bg-apex-surface-container px-2 py-2.5">
                      Lap
                    </th>
                    {Array.from({ length: sectorCount }, (_, index) => (
                      <th key={index} className="min-w-24 px-1 py-2.5 text-center">
                        S{index + 1} <span className="font-normal opacity-50">(opt)</span>
                      </th>
                    ))}
                    <th className="px-2 py-2.5 text-right">Total</th>
                    {canRemoveLap && <th className="w-[9%] px-1 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {lapRows.map((lap) => (
                    <tr
                      key={lap.key}
                      className={
                        lap.lockedOutLap
                          ? "border-b border-l-2 border-b-apex-outline-variant/15 border-l-apex-outline-variant/60 bg-apex-surface-container-high/70 text-apex-on-surface-variant/50 last:border-b-0"
                          : "border-b border-apex-outline-variant/15 last:border-b-0"
                      }
                    >
                      <td className="sticky left-0 z-10 bg-apex-surface-container p-3 align-middle font-apex-headline text-sm font-bold text-apex-on-surface">
                        <span className="inline-flex flex-col gap-0.5">
                          {String(lap.index + 1).padStart(2, "0")}
                          {renderOutLapBadge(lap.isOutLap, lap.lockedOutLap)}
                        </span>
                      </td>
                    {lap.sectors.map((sector) => (
                      <td key={sector.index} className="p-3 align-middle">
                          {renderSectorField(lap.index, sector.index, {
                            disabled: isSubmitting || lap.lockedOutLap,
                            invalid: sector.invalid,
                          })}
                        </td>
                      ))}
                      <td className="p-3 align-middle">
                        {renderTotalField(lap.index, {
                          disabled: isSubmitting || lap.lockedOutLap,
                          invalid: lap.totalInvalid,
                          valid: lap.totalValid,
                          align: "right",
                        })}
                      </td>
                      {canRemoveLap && (
                        <td className="p-1 text-center align-middle">
                          <button
                            type="button"
                            disabled={isSubmitting || lap.lockedOutLap}
                            onClick={() => removeLap(lap.index)}
                            aria-label={`Remove lap ${lap.index + 1}`}
                            className="text-apex-on-surface-variant transition-colors hover:text-apex-error disabled:opacity-50"
                          >
                            <Trash2 className="mx-auto size-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {renderAddLapButton(
                "flex w-full items-center justify-center gap-2 border-t border-apex-outline-variant/30 py-3",
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-apex-on-surface-variant/60">
            <span>Format: m:ss.mmm or ss.mmm (e.g. 1:32.456)</span>
            <span>
              {sim
                ? `Max ${maxLapsForSim} · ${fields.length} row${fields.length === 1 ? "" : "s"}`
                : "Select sim for limit"}
            </span>
          </div>

          {lapsRootMessage && (
            <p className="text-xs text-apex-error">{lapsRootMessage}</p>
          )}
          {fields.map((fieldItem, index) => {
            const totalErr = form.getFieldState(
              `laps.${index}.lapTime`,
              formState,
            ).error;
            const sectorErr = fieldErrorMessage(
              form.getFieldState(`laps.${index}.sectors`, formState).error,
            );
            const message =
              (typeof totalErr?.message === "string" && totalErr.message) ||
              sectorErr;
            if (!message) return null;
            return (
              <p key={fieldItem.id} className="text-xs text-apex-error">
                Lap {index + 1}: {message}
              </p>
            );
          })}
        </FormBlock>

        <FormBlock
          title="Caption"
          description="Public remark shown on your session card (optional, max 280 characters)."
        >
          <FormField
            control={form.control}
            name="caption"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="caption" className="sr-only">
                  Caption (optional)
                </FormLabel>
                <FormControl>
                  <textarea
                    id="caption"
                    disabled={isSubmitting}
                    placeholder="Share what made this session special…"
                    rows={2}
                    maxLength={280}
                    className={appManualTextareaClassName}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-apex-error" />
              </FormItem>
            )}
          />
        </FormBlock>

        {formState.errors.root?.message ? (
          <div className="flex items-start gap-2 rounded-lg border border-apex-error/20 bg-apex-error/10 p-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-apex-error" />
            <FormRootMessage className="flex-1 text-sm text-apex-error" />
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={isSubmitting}
          className={cn(appPrimaryButtonClassName, "w-full rounded-[0.5rem]")}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {submittingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </form>
    </Form>
  );
}
