import { useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Trophy, Upload as UploadIcon } from "lucide-react";
import { apiErrorText, createManualActivity, getChallenge } from "@/lib/api";
import type { ManualActivityRequest } from "@/lib/api";
import type { ManualActivityInitialData } from "@/components/ManualActivityForm";
import PageMeta from "@/components/PageMeta";
import ChallengeDetailBackLink from "@/pages/challenges/ChallengeDetailBackLink";
import {
  challengeDetailToManualPrefill,
  challengeManualPrefillToInitialData,
  type ChallengeManualPrefill,
} from "@/lib/challenges/challengeManualPrefill";
import { COMPANY_NAME } from "@/lib/siteMeta";
import ManualActivityForm from "./manual/ManualActivityForm";
import ManualActivityFormSkeleton from "./manual/ManualActivityFormSkeleton";

const MANUAL_PATH = "/manual";
const manualTitle = `Log activity | ${COMPANY_NAME}`;
const manualDescription = `Log a sim racing session manually on ${COMPANY_NAME} when you don't have telemetry files.`;

type FormState = "idle" | "submitting" | "success" | "error";

type ManualNavState = {
  challengePrefill?: ChallengeManualPrefill;
} | null;

export default function ManualActivity() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navState = location.state as ManualNavState;
  const challengePrefill = navState?.challengePrefill;
  const challengeId = searchParams.get("challenge")?.trim() || undefined;
  const isChallengeLinked = Boolean(challengeId);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const needsChallengeFetch = Boolean(challengeId && !challengePrefill);

  const { data: fetchedChallenge, isPending: challengePrefillLoading } =
    useQuery({
      queryKey: ["challenges", "detail", challengeId, "manual-prefill"],
      queryFn: async () => {
        const data = await getChallenge(challengeId!);
        if (!data) throw new Error("Challenge not found");
        return data;
      },
      enabled: needsChallengeFetch,
    });

  const initialData = useMemo((): ManualActivityInitialData | undefined => {
    if (challengePrefill?.sim && challengePrefill.track) {
      return challengeManualPrefillToInitialData(challengePrefill);
    }
    if (fetchedChallenge && !fetchedChallenge.banned) {
      return challengeManualPrefillToInitialData(
        challengeDetailToManualPrefill(fetchedChallenge),
      );
    }
    return undefined;
  }, [challengePrefill, fetchedChallenge]);

  const waitingForChallengePrefill =
    needsChallengeFetch && challengePrefillLoading;

  const pagePath = isChallengeLinked
    ? `${MANUAL_PATH}?challenge=${encodeURIComponent(challengeId!)}`
    : MANUAL_PATH;

  async function handleSubmit(data: ManualActivityRequest) {
    setFormState("submitting");
    setErrorMessage(null);

    try {
      const result = await createManualActivity({
        ...data,
        ...(challengeId ? { challengeId } : {}),
      });
      setFormState("success");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("apex:activity-updated", {
            detail: { sessionId: result.sessionId },
          }),
        );
      }
      setTimeout(() => {
        navigate(`/sessions/${result.sessionId}`);
      }, 1000);
    } catch (err) {
      const message =
        apiErrorText(err, "Failed to create activity. Please try again.");
      setErrorMessage(message);
      setFormState("error");
    }
  }

  return (
    <>
      <PageMeta
        title={manualTitle}
        description={manualDescription}
        path={pagePath}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        {isChallengeLinked && challengeId && (
          <ChallengeDetailBackLink challengeId={challengeId} />
        )}

        <div className="mx-auto w-full max-w-4xl">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Manual Entry
          </h1>
          <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            Record a session without telemetry. Saved to your sessions library
            and activity feed — not included in profile stats.
          </p>
        </div>

        <div className="mx-auto w-full max-w-4xl space-y-8">
          {isChallengeLinked && formState !== "success" && (
            <div className="flex items-start gap-3 rounded-apex-lg border border-apex-outline-variant/20 bg-apex-surface-container-high px-4 py-3">
              <Trophy
                className="mt-0.5 size-4 shrink-0 text-apex-primary"
                aria-hidden
              />
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                This session will count toward your active challenge when saved.
              </p>
            </div>
          )}

          {formState === "success" ? (
            <div className="rounded-apex-lg bg-apex-surface-container-low py-10 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-apex-success/10 ring-1 ring-apex-success/20">
                  <CheckCircle className="size-7 text-apex-success" />
                </div>
              </div>
              <p className="font-apex-body text-lg font-medium text-apex-on-surface">
                Activity logged
              </p>
              <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
                Redirecting to your session…
              </p>
            </div>
          ) : waitingForChallengePrefill ? (
            <ManualActivityFormSkeleton />
          ) : (
            <ManualActivityForm
              initialData={initialData}
              hideRecentSessions={isChallengeLinked}
              onSubmit={handleSubmit}
              submitLabel="Save session"
              submittingLabel="Saving…"
              isSubmitting={formState === "submitting"}
              errorMessage={errorMessage}
            />
          )}

          {!isChallengeLinked && (
            <p className="text-center font-apex-body text-sm text-apex-on-surface-variant">
              Have an iRacing{" "}
              <code className="rounded-apex-sm bg-apex-surface-container-highest px-1.5 py-0.5 font-apex-body text-xs text-apex-on-surface">
                .ibt
              </code>{" "}
              file?{" "}
              <Link
                to="/upload"
                className="inline-flex items-center gap-1 font-apex-body font-medium text-apex-on-surface transition-colors hover:text-apex-primary"
              >
                <UploadIcon className="size-3.5" aria-hidden />
                Upload telemetry
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
