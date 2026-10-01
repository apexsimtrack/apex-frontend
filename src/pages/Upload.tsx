import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Upload as UploadIcon,
  FileText,
  AlertCircle,
  Loader2,
  PenLine,
  CheckCircle,
  Check,
  Trophy,
  Gauge,
  Car,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  appManualInputClassName,
  appOutlineButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { wholeNumberInputProps } from "@/lib/inputGuards";
import { apiErrorText, uploadSessionFile, ApiError, withRequestId } from "@/lib/api";
import { isProRequiredError } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import ChallengeDetailBackLink from "@/pages/challenges/ChallengeDetailBackLink";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { MAX_MANUAL_UPLOAD_BYTES } from "@/lib/uploadLimits";
import {
  inferLmuUploadKind,
  LMU_RESULT_POSITION_MAX,
  LMU_RESULT_POSITION_MIN,
  lmuKindSupportsResult,
  lmuResultPositionLabel,
  validateLmuResultInput,
} from "@/lib/lmuUploadResult";
import { cn } from "@/lib/utils";
import { useIsProUser } from "@/contexts/AuthContext";


const UPLOAD_PATH = "/upload";
const uploadTitle = `Upload session | ${COMPANY_NAME}`;
const uploadDescription = `Upload iRacing .ibt or Le Mans Ultimate .duckdb telemetry to ${COMPANY_NAME} to process laps and share sessions.`;

const MAX_MB_LABEL = Math.round(MAX_MANUAL_UPLOAD_BYTES / (1024 * 1024));

const SECTION_LABEL_CLASS =
  "font-apex-headline text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant";

type UploadSim = "iracing" | "lmu";
type UploadState = "idle" | "uploading" | "success" | "error";
type UploadPhase = "bytes" | "processing";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function expectedExtForSim(sim: UploadSim): string {
  return sim === "lmu" ? "duckdb" : "ibt";
}

function simLabel(sim: UploadSim): string {
  return sim === "lmu" ? "Le Mans Ultimate" : "iRacing";
}

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPro = useIsProUser();
  const challengeId = searchParams.get("challenge")?.trim() || undefined;
  const isChallengeLinked = Boolean(challengeId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sim, setSim] = useState<UploadSim>("iracing");
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("bytes");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [challengeAttachWarning, setChallengeAttachWarning] = useState<
    string | null
  >(null);
  const [successSessionId, setSuccessSessionId] = useState<string | null>(null);
  const postSuccessNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [resultPosition, setResultPosition] = useState("");
  const [resultTotalDrivers, setResultTotalDrivers] = useState("");

  const isBusy = uploadState === "uploading";
  const expectedExt = expectedExtForSim(sim);

  const lmuKind = sim === "lmu" && file ? inferLmuUploadKind(file.name) : null;
  const showResultFields = lmuKind != null && lmuKindSupportsResult(lmuKind);

  useEffect(() => {
    if (!isBusy) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Upload in progress. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBusy]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      uploadAbortControllerRef.current?.abort();
      uploadAbortControllerRef.current = null;
      if (postSuccessNavRef.current) {
        clearTimeout(postSuccessNavRef.current);
        postSuccessNavRef.current = null;
      }
    };
  }, []);

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      if (!selectedFile) return;

      const ext = selectedFile.name.toLowerCase().split(".").pop();
      if (ext !== expectedExt) {
        setErrorMessage(
          sim === "lmu"
            ? "Only .duckdb files are supported for Le Mans Ultimate."
            : "Only .ibt files are supported for iRacing.",
        );
        setUploadState("error");
        return;
      }

      if (selectedFile.size > MAX_MANUAL_UPLOAD_BYTES) {
        setErrorMessage(
          `File exceeds maximum size of ${MAX_MB_LABEL} MB (this file is ${formatFileSize(selectedFile.size)}).`,
        );
        setUploadState("error");
        return;
      }

      setFile(selectedFile);
      setUploadState("idle");
      setErrorMessage(null);
    },
    [expectedExt, sim],
  );

  const handleSimChange = useCallback((next: UploadSim) => {
    setSim(next);
    setFile(null);
    setUploadState("idle");
    setErrorMessage(null);
    setResultPosition("");
    setResultTotalDrivers("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      handleFileSelect(droppedFile);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0] ?? null;
      handleFileSelect(selectedFile);
    },
    [handleFileSelect],
  );

  const handleUpload = useCallback(async () => {
    if (!file || isBusy) return;

    if (!isPro) {
      setErrorMessage(
        "Apex Pro is required to upload telemetry files (.ibt / .duckdb).",
      );
      setUploadState("error");
      return;
    }

    if (file.size > MAX_MANUAL_UPLOAD_BYTES) {
      setErrorMessage(
        `File exceeds maximum size of ${MAX_MB_LABEL} MB (this file is ${formatFileSize(file.size)}).`,
      );
      setUploadState("error");
      return;
    }

    if (showResultFields) {
      const resultError = validateLmuResultInput(
        resultPosition,
        resultTotalDrivers,
      );
      if (resultError) {
        setErrorMessage(resultError);
        setUploadState("error");
        return;
      }
    }

    setUploadState("uploading");
    setUploadPhase("bytes");
    setUploadPercent(0);
    setErrorMessage(null);
    setChallengeAttachWarning(null);
    setSuccessSessionId(null);

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    try {
      const result = await uploadSessionFile(
        file,
        {
          onUploadProgress: (p) => {
            setUploadPercent(p);
            if (p >= 100) setUploadPhase("processing");
          },
          onUploadComplete: () => {
            setUploadPhase("processing");
            setUploadPercent(100);
          },
        },
        {
          ...(challengeId ? { challengeId } : {}),
          ...(showResultFields
            ? { position: resultPosition, totalDrivers: resultTotalDrivers }
            : {}),
          signal: abortController.signal,
        },
      );

      if (!isMountedRef.current) return;
      const attachWarn =
        typeof result.challengeAttachWarning === "string" &&
        result.challengeAttachWarning.trim()
          ? result.challengeAttachWarning.trim()
          : null;
      setChallengeAttachWarning(attachWarn);
      setSuccessSessionId(result.sessionId);
      setUploadState("success");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("apex:activity-updated", {
            detail: { sessionId: result.sessionId },
          }),
        );
      }
      if (postSuccessNavRef.current) {
        clearTimeout(postSuccessNavRef.current);
        postSuccessNavRef.current = null;
      }
      const redirectMs = attachWarn ? 6000 : 1000;
      postSuccessNavRef.current = setTimeout(() => {
        postSuccessNavRef.current = null;
        navigate(`/sessions/${result.sessionId}`);
      }, redirectMs);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (isProRequiredError(err)) {
        setErrorMessage(
          withRequestId(
            "Apex Pro is required to upload telemetry files (.ibt / .duckdb).",
            err,
          ),
        );
        setUploadState("error");
        return;
      }
      const message =
        apiErrorText(err, "Upload failed. Please try again.");
      setErrorMessage(message);
      setUploadState("error");
    } finally {
      if (uploadAbortControllerRef.current === abortController) {
        uploadAbortControllerRef.current = null;
      }
    }
  }, [
    file,
    isBusy,
    isPro,
    navigate,
    challengeId,
    showResultFields,
    resultPosition,
    resultTotalDrivers,
  ]);

  const handleCancelUpload = useCallback(() => {
    uploadAbortControllerRef.current?.abort();
  }, []);

  const handleReset = useCallback(() => {
    setFile(null);
    setUploadState("idle");
    setUploadPhase("bytes");
    setUploadPercent(0);
    setErrorMessage(null);
    setChallengeAttachWarning(null);
    setSuccessSessionId(null);
    setResultPosition("");
    setResultTotalDrivers("");
    if (postSuccessNavRef.current) {
      clearTimeout(postSuccessNavRef.current);
      postSuccessNavRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const pagePath = isChallengeLinked
    ? `${UPLOAD_PATH}?challenge=${encodeURIComponent(challengeId!)}`
    : UPLOAD_PATH;

  return (
    <>
      <PageMeta
        title={uploadTitle}
        description={uploadDescription}
        path={pagePath}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        {isChallengeLinked && challengeId && (
          <ChallengeDetailBackLink challengeId={challengeId} />
        )}

        <div className="mx-auto w-full max-w-2xl">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Upload session
          </h1>
          <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            Upload{" "}
            <code className="rounded-apex-sm bg-apex-surface-container-highest px-1.5 py-0.5 font-apex-body text-xs text-apex-on-surface">
              .ibt
            </code>{" "}
            (iRacing) or{" "}
            <code className="rounded-apex-sm bg-apex-surface-container-highest px-1.5 py-0.5 font-apex-body text-xs text-apex-on-surface">
              .duckdb
            </code>{" "}
            (Le Mans Ultimate) telemetry — laps, sectors, and driving traces
            when available (max {MAX_MB_LABEL} MB). Apex Pro required.
          </p>
        </div>

        {!isPro && uploadState !== "success" && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-apex-lg border border-apex-outline-variant/20 bg-apex-surface-container-high p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              Manual telemetry upload is an Apex Pro feature. Upgrade to process
              .ibt and .duckdb files from the web.
            </p>
            <Button
              type="button"
              className={cn(appPrimaryButtonClassName, "shrink-0")}
              onClick={() => navigate("/pricing")}
            >
              Upgrade to Pro
            </Button>
          </div>
        )}

        {challengeId && uploadState !== "success" && (
          <div className="mx-auto flex w-full max-w-2xl items-start gap-3 rounded-apex-lg border border-apex-outline-variant/20 bg-apex-surface-container-high px-4 py-3">
            <Trophy
              className="mt-0.5 size-4 shrink-0 text-apex-primary"
              aria-hidden
            />
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              This upload will count toward your active challenge when
              processed.
            </p>
          </div>
        )}

        <div className="mx-auto w-full max-w-2xl">
          {uploadState === "success" ? (
            <div className="rounded-lg bg-apex-surface-container-low py-10 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-apex-success/10 ring-1 ring-apex-success/20">
                  <CheckCircle className="size-7 text-apex-success" />
                </div>
              </div>
              <p className="text-lg font-medium text-apex-on-surface">
                Session uploaded
              </p>
              {challengeAttachWarning ? (
                <>
                  <div className="mx-auto mt-5 max-w-md text-left">
                    <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-amber-200">
                          Not counted toward this challenge
                        </p>
                        <p className="mt-1 text-sm text-amber-100/90">
                          {challengeAttachWarning}
                        </p>
                        <p className="mt-2 text-xs text-amber-200/70">
                          Your laps are saved on the session, but this run did
                          not qualify for the challenge leaderboard.
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-apex-on-surface-variant">
                    Opening session in a few seconds…
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "mt-4 w-full rounded-[0.5rem]",
                      appOutlineButtonClassName,
                    )}
                    onClick={() => {
                      if (postSuccessNavRef.current) {
                        clearTimeout(postSuccessNavRef.current);
                        postSuccessNavRef.current = null;
                      }
                      if (successSessionId)
                        navigate(`/sessions/${successSessionId}`);
                    }}
                  >
                    Continue to session
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-sm text-apex-on-surface-variant">
                  Redirecting to your session…
                </p>
              )}
            </div>
          ) : uploadState === "uploading" ? (
            <div className="rounded-lg bg-apex-surface-container-low p-6 py-10">
              <div className="mb-5 flex justify-center">
                <Loader2 className="size-10 animate-spin text-apex-on-surface-variant" />
              </div>
              <p className="text-center text-lg font-medium text-apex-on-surface">
                {uploadPhase === "bytes"
                  ? "Uploading…"
                  : "Processing telemetry…"}
              </p>
              <p className="mt-2 text-center text-sm text-apex-on-surface-variant">
                {uploadPhase === "bytes"
                  ? "Sending file to the server."
                  : "Extracting laps and saving your session."}
              </p>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-apex-surface-container-highest">
                {uploadPhase === "bytes" ? (
                  <div
                    className="apex-primary-gradient h-full rounded-full transition-[width] duration-150 ease-out"
                    style={{
                      width: `${Math.max(0, Math.min(100, uploadPercent))}%`,
                    }}
                  />
                ) : (
                  <div
                    className="apex-upload-indeterminate-track h-full"
                    role="progressbar"
                    aria-valuetext="Processing telemetry"
                    aria-label="Processing telemetry"
                  >
                    <div className="apex-upload-indeterminate-bar" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-apex-on-surface-variant">
                {uploadPhase === "bytes"
                  ? `${uploadPercent}%`
                  : "Processing on server…"}
              </p>
              {uploadPhase === "bytes" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelUpload}
                  className={cn(
                    "mt-6 w-full rounded-[0.5rem]",
                    appOutlineButtonClassName,
                  )}
                >
                  Cancel upload
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-4 sm:p-5">
              <header className="mb-4 border-b border-apex-outline-variant/10 pb-3">
                <h2 className={SECTION_LABEL_CLASS}>Simulator</h2>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        id: "iracing" as const,
                        label: "iRacing",
                        ext: ".ibt",
                        Icon: Gauge,
                      },
                      {
                        id: "lmu" as const,
                        label: "Le Mans Ultimate",
                        ext: ".duckdb",
                        Icon: Car,
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = sim === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSimChange(opt.id)}
                        aria-pressed={selected}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-apex-lg border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
                          selected
                            ? "border-apex-primary/60 bg-apex-primary/5 ring-1 ring-apex-primary/30"
                            : "border-apex-outline-variant/20 bg-apex-surface-container hover:border-apex-outline-variant/50 hover:bg-apex-surface-container-high",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-apex-sm transition-colors",
                            selected
                              ? "bg-apex-primary/15 text-apex-primary"
                              : "bg-apex-surface-container-highest text-apex-on-surface-variant group-hover:text-apex-on-surface",
                          )}
                        >
                          <opt.Icon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-apex-body text-sm font-bold text-apex-on-surface">
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block font-apex-body text-[11px] text-apex-on-surface-variant">
                            {opt.ext} telemetry
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            selected
                              ? "border-apex-primary bg-apex-primary text-white"
                              : "border-apex-outline-variant/40 text-transparent",
                          )}
                          aria-hidden
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </header>

              <header className="mb-4 border-b border-apex-outline-variant/10 pb-3">
                <h2 className={SECTION_LABEL_CLASS}>Telemetry file</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-apex-on-surface-variant">
                  Drag and drop or browse for a {simLabel(sim)}{" "}
                  <code className="rounded-apex-sm bg-apex-surface-container-highest px-1 py-0.5 text-[10px]">
                    .{expectedExt}
                  </code>{" "}
                  file.
                </p>
              </header>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "relative cursor-pointer rounded-[0.5rem] border-2 border-dashed p-8 transition-colors sm:p-10",
                  isDragOver
                    ? "border-apex-primary/50 bg-apex-surface-container-high"
                    : "border-apex-outline-variant/40 hover:border-apex-outline-variant/70 hover:bg-apex-surface-container-high/60",
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={`.${expectedExt}`}
                  onChange={handleInputChange}
                  className="hidden"
                />

                <div className="flex flex-col items-center text-center">
                  {file ? (
                    <>
                      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-apex-surface-container-highest ring-1 ring-apex-outline-variant/20">
                        <FileText className="size-6 text-apex-on-surface-variant" />
                      </div>
                      <p className="max-w-full truncate text-sm font-medium text-apex-on-surface">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-apex-on-surface-variant">
                        {formatFileSize(file.size)}
                      </p>
                      <p className="mt-3 text-xs text-apex-on-surface-variant">
                        Click or drop to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-apex-surface-container-highest ring-1 ring-apex-outline-variant/20">
                        <UploadIcon className="size-6 text-apex-on-surface-variant" />
                      </div>
                      <p className="text-sm text-apex-on-surface">
                        Drag &amp; drop your .{expectedExt} file here
                      </p>
                      <p className="mt-1 text-xs text-apex-on-surface-variant">
                        or click to browse (max {MAX_MB_LABEL} MB)
                      </p>
                    </>
                  )}
                </div>
              </div>

              {showResultFields && (
                <div className="mt-4 rounded-lg border border-apex-outline-variant/20 bg-apex-surface-container p-4">
                  <h2 className={SECTION_LABEL_CLASS}>
                    {lmuKind === "qualifying" ? "Qualifying result" : "Race result"}{" "}
                    (optional)
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-apex-on-surface-variant">
                    Le Mans Ultimate does not store your finishing position in the
                    telemetry file, so it cannot be read from your upload. Add it
                    here to show it on the session, or leave blank and edit the
                    session later.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block font-apex-body text-xs text-apex-on-surface-variant">
                        {lmuResultPositionLabel(lmuKind)}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={LMU_RESULT_POSITION_MIN}
                        max={LMU_RESULT_POSITION_MAX}
                        placeholder="e.g. 3"
                        value={resultPosition}
                        disabled={isBusy}
                        onChange={(e) => setResultPosition(e.target.value)}
                        className={appManualInputClassName}
                        {...wholeNumberInputProps}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block font-apex-body text-xs text-apex-on-surface-variant">
                        Total cars
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={LMU_RESULT_POSITION_MIN}
                        max={LMU_RESULT_POSITION_MAX}
                        placeholder="e.g. 24"
                        value={resultTotalDrivers}
                        disabled={isBusy}
                        onChange={(e) => setResultTotalDrivers(e.target.value)}
                        className={appManualInputClassName}
                        {...wholeNumberInputProps}
                      />
                    </label>
                  </div>
                </div>
              )}

              {uploadState === "error" && errorMessage && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-apex-error/20 bg-apex-error/10 p-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-apex-error" />
                  <p className="text-sm text-apex-error">{errorMessage}</p>
                </div>
              )}

              <div className="flex gap-3 border-t border-apex-outline-variant/10 pt-6">
                {file && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    className={cn(
                      "flex-1 rounded-[0.5rem]",
                      appOutlineButtonClassName,
                    )}
                  >
                    Clear
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file}
                  className={cn(
                    appPrimaryButtonClassName,
                    "rounded-[0.5rem]",
                    file ? "flex-1" : "w-full",
                  )}
                >
                  {uploadState === "error" && file
                    ? "Retry upload"
                    : "Upload session"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {!isChallengeLinked && (
          <p className="text-center font-apex-body text-sm text-apex-on-surface-variant">
            Don&apos;t have a telemetry file?{" "}
            <Link
              to="/manual"
              className="inline-flex items-center gap-1 font-apex-body font-medium text-apex-on-surface transition-colors hover:text-apex-primary"
            >
              <PenLine className="size-3.5" aria-hidden />
              Log manual activity
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
