import { useState } from "react";
import { Loader2 } from "lucide-react";
import { BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudiencePicker } from "./AudiencePicker";
import {
  apiErrorText,
  createBroadcast,
  updateBroadcast,
  type AdminBroadcastDetail,
  type AudienceDescriptor,
  type CreateBroadcastInput,
} from "@/lib/api";
import type { NotificationSeverity } from "@/lib/api";

const SEVERITIES: { id: NotificationSeverity; label: string; tint: string }[] =
  [
    {
      id: "INFO",
      label: "Info",
      tint: "bg-sky-500/15 border-sky-500/40 text-sky-300",
    },
    {
      id: "SUCCESS",
      label: "Success",
      tint: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    },
    {
      id: "WARNING",
      label: "Warning",
      tint: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    },
    {
      id: "CRITICAL",
      label: "Critical",
      tint: "bg-red-500/15 border-red-500/40 text-red-300",
    },
    {
      id: "MAINTENANCE",
      label: "Maintenance",
      tint: "bg-violet-500/15 border-violet-500/40 text-violet-300",
    },
  ];

interface Props {
  initial?: AdminBroadcastDetail | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function localInputFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function isoFromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function BroadcastComposeModal({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [severity, setSeverity] = useState<NotificationSeverity>(
    initial?.severity ?? "INFO",
  );
  const [dismissible, setDismissible] = useState<boolean>(
    initial?.dismissible ?? true,
  );
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(initial?.ctaUrl ?? "");
  const [startsAt, setStartsAt] = useState(
    localInputFromIso(initial?.startsAt) ||
      localInputFromIso(new Date().toISOString()),
  );
  const [endsAt, setEndsAt] = useState(localInputFromIso(initial?.endsAt));
  type CreateStatus = "DRAFT" | "SCHEDULED" | "ACTIVE";
  const [createStatus, setCreateStatus] = useState<CreateStatus>("DRAFT");
  const [audience, setAudience] = useState<AudienceDescriptor>({
    audienceType: initial?.audienceType ?? "ALL",
    audienceFilter: initial?.audienceFilter ?? null,
    audienceUserIds: initial?.audienceUserIds ?? [],
    audienceRole: initial?.audienceRole ?? null,
    audiencePlan: initial?.audiencePlan ?? null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setErr(null);
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setErr("Title and body are required.");
      return;
    }
    const startsIso = isoFromLocalInput(startsAt) ?? new Date().toISOString();
    const endsIso = endsAt ? isoFromLocalInput(endsAt) : null;
    if (
      endsIso &&
      new Date(endsIso).getTime() <= new Date(startsIso).getTime()
    ) {
      setErr("End time must be after start time.");
      return;
    }
    if (
      audience.audienceType === "USER_IDS" &&
      (audience.audienceUserIds?.length ?? 0) === 0
    ) {
      setErr("Select at least one user.");
      return;
    }
    if (!isEdit && createStatus === "SCHEDULED") {
      if (new Date(startsIso).getTime() <= Date.now()) {
        setErr("Scheduled start time must be in the future.");
        return;
      }
    }
    const payload: CreateBroadcastInput = {
      title: t,
      body: b,
      severity,
      dismissible,
      ctaLabel: ctaLabel.trim() || null,
      ctaUrl: ctaUrl.trim() || null,
      startsAt: startsIso,
      endsAt: endsIso,
      ...audience,
      ...(isEdit ? {} : { status: createStatus }),
    };
    setPending(true);
    try {
      if (isEdit && initial) {
        await updateBroadcast(initial.id, payload);
      } else {
        await createBroadcast(payload);
      }
      await onSaved();
    } catch (e) {
      setErr(apiErrorText(e, "Failed to save broadcast"));
    } finally {
      setPending(false);
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Edit broadcast" : "New broadcast"}
      size="xl"
      mobileVariant="fullscreen"
      bodyClassName="min-h-0 space-y-4"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create broadcast"
            )}
          </Button>
        </>
      }
    >
      <div>
        <Label className="text-xs text-muted-foreground">
          Title <span className="text-red-400">*</span>
        </Label>
        <Input
          className="mt-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">
          Body <span className="text-red-400">*</span>
        </Label>
        <Textarea
          className="mt-1 min-h-[100px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Severity</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeverity(s.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                severity === s.id
                  ? s.tint
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">
            CTA label (optional)
          </Label>
          <Input
            className="mt-1"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Learn more"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            CTA URL (optional)
          </Label>
          <Input
            className="mt-1"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Starts at</Label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Ends at (optional)
          </Label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={endsAt ?? ""}
            onChange={(e) => setEndsAt(e.target.value || null)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={dismissible}
          onChange={(e) => setDismissible(e.target.checked)}
        />
        Allow users to dismiss this banner
      </label>

      <div className="border-t border-white/10 pt-4">
        <Label className="text-sm font-semibold text-foreground">
          Audience
        </Label>
        <div className="mt-2">
          <AudiencePicker value={audience} onChange={setAudience} />
        </div>
      </div>

      {!isEdit && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
          <Label className="text-xs text-muted-foreground">
            When to publish
          </Label>
          <div className="mt-2 grid gap-2">
            {(
              [
                {
                  id: "DRAFT" as const,
                  title: "Save as draft",
                  desc: "Edit later and publish manually.",
                },
                {
                  id: "SCHEDULED" as const,
                  title: "Schedule",
                  desc: "Auto-publish at the start time above.",
                },
                {
                  id: "ACTIVE" as const,
                  title: "Publish now",
                  desc: "Show to eligible users immediately.",
                },
              ] satisfies { id: CreateStatus; title: string; desc: string }[]
            ).map((opt) => (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition ${
                  createStatus === opt.id
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-white/10 bg-transparent text-muted-foreground hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name="broadcast-create-status"
                  className="mt-1"
                  checked={createStatus === opt.id}
                  onChange={() => setCreateStatus(opt.id)}
                />
                <span className="flex-1">
                  <span className="block font-medium text-foreground">
                    {opt.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {opt.desc}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}
    </BaseModal>
  );
}
