import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { buildPageTitle } from "@/lib/seo";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { apiErrorText, apiGet, updateActivity, ApiError, withRequestId } from "@/lib/api";
import type { ManualActivityRequest } from "@/lib/api";
import {
  manualActivityInitialFromPublicDetail,
  type PublicSessionDetailForEdit,
} from "@/lib/sessionEditInitialData";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateSessionDerivedCaches } from "@/lib/profileQueryKeys";
import ManualActivityForm from "./manual/ManualActivityForm";
import ManualActivityFormSkeleton from "./manual/ManualActivityFormSkeleton";

type FormState = "idle" | "submitting" | "success" | "error";

type SessionDetailForEdit = PublicSessionDetailForEdit & { id: string };

export default function EditActivity() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const sid = sessionId?.trim() ?? "";

  const {
    data: initialData,
    isPending: loadLoading,
    error: loadErr,
    isError: loadFailed,
  } = useQuery({
    queryKey: ["sessions", "edit", sid],
    queryFn: async () => {
      const data = await apiGet<SessionDetailForEdit>(
        `/api/sessions/${sid}?forEdit=1`,
      );
      return manualActivityInitialFromPublicDetail(data);
    },
    enabled: Boolean(sid),
  });

  const loadError = loadFailed
    ? withRequestId(
        loadErr instanceof Error ? loadErr.message : "Failed to load session.",
        loadErr,
      )
    : null;

  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(data: ManualActivityRequest) {
    if (!sessionId) return;

    setFormState("submitting");
    setErrorMessage(null);

    try {
      await updateActivity(sessionId, data);
      setFormState("success");
      invalidateSessionDerivedCaches(queryClient, {
        sessionId,
        ownerUserId: user?.id ?? null,
        removeSessionQueries: false,
      });
      setTimeout(() => {
        navigate(`/sessions/${sessionId}`);
      }, 1000);
    } catch (err) {
      const message =
        apiErrorText(err, "Failed to update activity. Please try again.");
      setErrorMessage(message);
      setFormState("error");
    }
  }

  const editPath = sid ? `/sessions/${sid}/edit` : "/sessions";

  return (
    <>
      <PageMeta
        title={buildPageTitle("Edit session")}
        description={`Edit your ${COMPANY_NAME} session details.`}
        path={editPath}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Edit session
          </h1>
          <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            Update sim, track, results, and lap times for this session.
          </p>
        </div>

        <div className="mx-auto w-full max-w-4xl space-y-8">
          {!sid ? (
            <div className="rounded-apex-lg bg-apex-surface-container-low py-10 text-center">
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                Missing session ID.
              </p>
            </div>
          ) : loadLoading ? (
            <ManualActivityFormSkeleton />
          ) : loadFailed || !initialData ? (
            <div className="rounded-apex-lg bg-apex-surface-container-low py-10 text-center">
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                {loadError ?? "Failed to load session."}
              </p>
            </div>
          ) : formState === "success" ? (
            <div className="rounded-apex-lg bg-apex-surface-container-low py-10 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-apex-success/10 ring-1 ring-apex-success/20">
                  <CheckCircle className="size-7 text-apex-success" />
                </div>
              </div>
              <p className="font-apex-body text-lg font-medium text-apex-on-surface">
                Session updated
              </p>
              <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
                Redirecting to your session…
              </p>
            </div>
          ) : (
            <ManualActivityForm
              key={`edit-${sid}-${initialData.telemetryMinLapRows ?? 0}`}
              initialData={initialData}
              hideRecentSessions
              onSubmit={handleSubmit}
              submitLabel="Save changes"
              submittingLabel="Saving…"
              isSubmitting={formState === "submitting"}
              errorMessage={errorMessage}
            />
          )}

          {sid ? (
            <p className="text-center font-apex-body text-sm text-apex-on-surface-variant">
              <Link
                to={`/sessions/${sid}`}
                className="inline-flex items-center gap-1 font-apex-body font-medium text-apex-on-surface transition-colors hover:text-apex-primary"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back to session
              </Link>
            </p>
          ) : (
            <p className="text-center font-apex-body text-sm text-apex-on-surface-variant">
              <Link
                to="/"
                className="inline-flex items-center gap-1 font-apex-body font-medium text-apex-on-surface transition-colors hover:text-apex-primary"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Go home
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
