import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminContactDetail,
  patchAdminContact,
  type AdminContactDetail as AdminContactDetailType,
  type AdminContactUserSummary,
  type ContactSubmissionStatus,
} from "@/lib/api";
import { apiErrorText } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft } from "lucide-react";

function formatContactStatus(status: string): string {
  const u = status.trim().toUpperCase();
  if (u === "NEW") return "New";
  if (u === "IN_PROGRESS") return "In progress";
  if (u === "RESOLVED") return "Resolved";
  if (u === "ARCHIVED") return "Archived";
  if (u === "SPAM") return "Spam";
  return status;
}

function UserCard({
  title,
  user,
}: {
  title: string;
  user: AdminContactUserSummary;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-card/40 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="text-foreground">{user.displayName ?? "—"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all text-foreground">{user.email}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="text-foreground">{user.plan}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Verified</dt>
          <dd className="text-foreground">
            {user.emailVerified ? "Yes" : "No"}
          </dd>
        </div>
        {(user.suspendedAt || user.isDeleted) && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {user.isDeleted ? "Deleted account" : "Suspended"}
          </div>
        )}
      </dl>
      <div className="mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/admin/users/${encodeURIComponent(user.id)}`}>
            View user in admin
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function AdminContactDetail() {
  const { contactId } = useParams<{ contactId: string }>();
  const qc = useQueryClient();
  const [statusDraft, setStatusDraft] = useState<ContactSubmissionStatus | "">(
    "",
  );
  const [notesDraft, setNotesDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "contact", contactId],
    queryFn: () => fetchAdminContactDetail(contactId!),
    enabled: Boolean(contactId?.trim()),
  });

  useEffect(() => {
    if (!data) return;
    setStatusDraft(data.status);
    setNotesDraft(data.internalNotes ?? "");
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      patchAdminContact(contactId!, {
        status: statusDraft || undefined,
        internalNotes: notesDraft === "" ? null : notesDraft,
      }),
    onSuccess: async (updated: AdminContactDetailType) => {
      setSaveError(null);
      await qc.invalidateQueries({ queryKey: ["admin", "contact"] });
      setStatusDraft(updated.status);
      setNotesDraft(updated.internalNotes ?? "");
    },
    onError: (e: unknown) => {
      setSaveError(apiErrorText(e, "Save failed"));
    },
  });

  if (!contactId?.trim()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">
        Invalid id.
      </div>
    );
  }

  const titleBase = `Admin · Contact · ${contactId.slice(0, 8)}…`;
  const metaTitle = `${titleBase} | ${COMPANY_NAME}`;

  return (
    <>
      <PageMeta
        path={`/admin/contact/${contactId}`}
        title={metaTitle}
        description="Contact submission."
        noindex
      />
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            to="/admin/contact"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to inbox
          </Link>
        </div>

        {isError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load submission.")}
          </div>
        )}

        {isPending && (
          <div className="flex justify-center py-16">
            <Loader2
              className="size-6 animate-spin text-muted-foreground"
              aria-hidden
            />
          </div>
        )}

        {!isPending && data && (
          <>
            <header className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Contact message
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Received{" "}
                {new Date(data.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </header>

            {data.submitterEmailMismatch && (
              <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Session email differs from the address typed in the form — the
                signed-in account may not match the sender email below.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-card/30 p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Message
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {data.message}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  Form details
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="text-foreground">{data.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all text-foreground">{data.email}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Subject</dt>
                    <dd className="text-foreground">
                      {data.subject?.trim() ? data.subject : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Request ID</dt>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {data.requestId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">IP</dt>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {data.ip ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-white/10 p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  Triage
                </h2>
                <label
                  className="mt-3 block text-xs font-medium text-muted-foreground"
                  htmlFor="contact-status"
                >
                  Status
                </label>
                <select
                  id="contact-status"
                  className="mt-1 w-full rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={statusDraft}
                  onChange={(e) =>
                    setStatusDraft(e.target.value as ContactSubmissionStatus)
                  }
                >
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="SPAM">Spam</option>
                </select>
                <label
                  className="mt-4 block text-xs font-medium text-muted-foreground"
                  htmlFor="contact-notes"
                >
                  Internal notes
                </label>
                <Textarea
                  id="contact-notes"
                  className="mt-1 min-h-[120px] border-white/10 bg-background/80"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Notes visible only to admins…"
                />
                {saveError && (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    {saveError}
                  </p>
                )}
                <Button
                  type="button"
                  className="mt-4"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden
                      />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Current status: {formatContactStatus(data.status)}
                  {data.updatedAt !== data.createdAt && (
                    <>
                      {" "}
                      · Updated{" "}
                      {new Date(data.updatedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </>
                  )}
                </p>
              </div>

              {data.submitterUser && (
                <UserCard
                  title="Signed-in submitter"
                  user={data.submitterUser}
                />
              )}
              {data.linkedUser && (
                <UserCard
                  title="Account matching form email"
                  user={data.linkedUser}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
