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
  createCampaign,
  type AudienceDescriptor,
  type NotificationChannel,
  type NotificationSeverity,
} from "@/lib/api";

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
  onClose: () => void;
  onSent: () => void | Promise<void>;
}

export function CampaignComposeModal({ onClose, onSent }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [severity, setSeverity] = useState<NotificationSeverity>("INFO");
  const [inApp, setInApp] = useState(true);
  const [emailOn, setEmailOn] = useState(false);
  const [bypassPrefs, setBypassPrefs] = useState(false);
  const [audience, setAudience] = useState<AudienceDescriptor>({
    audienceType: "ALL",
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
    const channels: NotificationChannel[] = [];
    if (inApp) channels.push("IN_APP");
    if (emailOn) channels.push("EMAIL");
    if (channels.length === 0) {
      setErr("Select at least one channel.");
      return;
    }
    if (
      audience.audienceType === "USER_IDS" &&
      (audience.audienceUserIds?.length ?? 0) === 0
    ) {
      setErr("Select at least one user.");
      return;
    }
    setPending(true);
    try {
      await createCampaign({
        title: t,
        body: b,
        linkUrl: linkUrl.trim() || null,
        severity,
        channels,
        bypassUserPrefs: bypassPrefs,
        ...audience,
      });
      await onSent();
    } catch (e) {
      setErr(apiErrorText(e, "Failed to send campaign"));
    } finally {
      setPending(false);
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title="Send targeted notification"
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
                <Loader2 className="mr-2 size-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send now"
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
        <Label className="text-xs text-muted-foreground">
          Link URL (optional)
        </Label>
        <Input
          className="mt-1"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://…"
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

      <div>
        <Label className="text-xs text-muted-foreground">Channels</Label>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={inApp}
              onChange={(e) => setInApp(e.target.checked)}
            />
            In-app (notification bell)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={emailOn}
              onChange={(e) => setEmailOn(e.target.checked)}
            />
            Email (Resend)
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Email respects the recipient&apos;s notification preference and only
          sends to addresses flagged as VALID.
        </p>
      </div>

      <label className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={bypassPrefs}
          onChange={(e) => setBypassPrefs(e.target.checked)}
        />
        <span>
          <span className="block font-medium text-amber-200">
            Send to users who disabled notifications
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Use only for emergency, security, or billing notices. Invalid or
            bouncing email addresses are still skipped.
          </span>
        </span>
      </label>

      <div className="border-t border-white/10 pt-4">
        <Label className="text-sm font-semibold text-foreground">
          Audience
        </Label>
        <div className="mt-2">
          <AudiencePicker value={audience} onChange={setAudience} />
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}
    </BaseModal>
  );
}
