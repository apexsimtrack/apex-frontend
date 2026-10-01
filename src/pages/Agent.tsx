import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Cpu,
  Download,
  FileText,
  Loader2,
  Radio,
} from "lucide-react";
import AgentUpgradeModal from "@/pages/agent/AgentUpgradeModal";
import { AgentInstallRequirements } from "@/components/AgentInstallRequirements";
import { AgentPlatformSelector } from "@/components/AgentPlatformSelector";
import AgentProUpgradeCard from "@/components/AgentProUpgradeCard";
import { appPrimaryButtonClassName } from "@/components/app-ui/appButtonClasses";
import { useAuth, useIsProUser } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { downloadAgentBinary } from "@/lib/api/agentDownload";
import {
  apiErrorText,
  ApiError,
  isProRequiredError,
  withRequestId,
} from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { AUTH_PATHS } from "@/config/navigation";
import {
  AGENT_DOWNLOAD_FILENAMES,
  type AgentOs,
  useDetectedAgentOs,
} from "@/hooks/useDetectedAgentOs";
import { cn } from "@/lib/utils";

const AGENT_PATH = "/agent";
const agentTitle = `Apex Agent | ${COMPANY_NAME}`;
const agentDescription = `Download the ${COMPANY_NAME} Agent for macOS, Windows, and Linux — a background service that captures sim telemetry and uploads sessions automatically with Apex Pro.`;

const sectionEyebrowClassName =
  "font-apex-headline text-xs font-bold uppercase tracking-widest text-apex-on-surface-variant";

const SUPPORTED_SIMS: Array<{
  name: string;
  icon: typeof Radio;
  support: Record<AgentOs, boolean>;
  detail: Record<AgentOs, string>;
}> = [
  {
    name: "F1 25",
    icon: Radio,
    support: {
      macos: true,
      windows: true,
      linux: true,
    },
    detail: {
      macos: "Captures live UDP telemetry streams in the background.",
      windows: "Captures live UDP telemetry streams in the background.",
      linux: "Captures live UDP telemetry streams in the background.",
    },
  },
  {
    name: "iRacing",
    icon: FileText,
    support: {
      macos: false,
      windows: true,
      linux: false,
    },
    detail: {
      macos: "Automatic iRacing session log capture is currently Windows-only.",
      windows:
        "Watches and uploads .ibt session log files when disk telemetry is enabled.",
      linux:
        "Automatic iRacing session log capture is not currently available on Linux.",
    },
  },
  {
    name: "Le Mans Ultimate",
    icon: Cpu,
    support: {
      macos: false,
      windows: true,
      linux: false,
    },
    detail: {
      macos: "LMU telemetry recording support is currently Windows-only.",
      windows:
        "Watches telemetry recordings and uploads completed LMU sessions automatically.",
      linux:
        "LMU telemetry auto-discovery is not currently available on Linux.",
    },
  },
];

function platformSubtitle(os: AgentOs): string {
  if (os === "macos") {
    return "Runs in the menu bar and uploads sim telemetry in the background.";
  }
  if (os === "linux") {
    return "Runs in the system tray and currently focuses on F1 25 UDP telemetry.";
  }
  return "Runs in the system tray and uploads sim telemetry in the background.";
}

function simStatusLabel(supported: boolean): string {
  return supported ? "Supported" : "Windows only";
}

export default function Agent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const isPro = useIsProUser();
  const { selectedOs, setSelectedOs } = useDetectedAgentOs();
  const [isDownloading, setIsDownloading] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const showWelcomeBanner = searchParams.get("welcome") === "pro";

  const downloadFilename = AGENT_DOWNLOAD_FILENAMES[selectedOs];

  async function handleDownloadClick() {
    if (authLoading) return;

    if (!user || !isPro) {
      setUpgradeModalOpen(true);
      return;
    }

    setIsDownloading(true);
    try {
      await downloadAgentBinary(selectedOs);
    } catch (err) {
      if (isProRequiredError(err)) {
        setUpgradeModalOpen(true);
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Sign in required", {
          description: withRequestId(
            "Log in with an Apex Pro account to download the agent.",
            err,
          ),
        });
        navigate(AUTH_PATHS.login);
        return;
      }
      if (err instanceof ApiError && err.code === "AGENT_OBJECT_NOT_FOUND") {
        toast.error("Installer not published", {
          description: withRequestId(
            err.message ||
              "This platform’s installer has not been uploaded to storage yet. Try the other OS or check back later.",
            err,
          ),
        });
        return;
      }
      if (err instanceof ApiError && err.code === "AGENT_DOWNLOAD_DISABLED") {
        toast.error("Download temporarily unavailable", {
          description: withRequestId(
            err.message ||
              "Agent downloads are disabled. Please try again later.",
            err,
          ),
        });
        return;
      }
      if (err instanceof ApiError && err.code === "AGENT_NOT_AVAILABLE") {
        toast.error("Download unavailable", {
          description: withRequestId(
            err.message ||
              "No installer is configured on the server. Please try again later.",
            err,
          ),
        });
        return;
      }
      toast.error("Download failed", {
        description:
          apiErrorText(err, "Unable to start download. Please try again."),
      });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <PageMeta
        title={agentTitle}
        description={agentDescription}
        path={AGENT_PATH}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <section className="mx-auto mb-8 w-full max-w-4xl">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Apex Agent
          </h1>
          <p className="mt-2 text-sm text-apex-on-surface-variant">
            {platformSubtitle(selectedOs)}
          </p>
        </section>

        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-6">
            <AgentPlatformSelector
              selectedOs={selectedOs}
              onSelect={setSelectedOs}
            />
          </div>

          {showWelcomeBanner && isPro && (
            <div className="mb-6 rounded-lg border border-apex-success/30 bg-apex-success/10 px-4 py-3 text-sm">
              <p className="font-medium text-apex-success">
                Welcome to Apex Pro!
              </p>
              <p className="mt-1 text-apex-on-surface-variant">
                Download the agent below, then sign in with the same email and
                password you use on this website.
              </p>
              <button
                type="button"
                className="mt-2 text-xs text-apex-on-surface-variant underline-offset-2 hover:underline"
                onClick={() => {
                  searchParams.delete("welcome");
                  setSearchParams(searchParams, { replace: true });
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          <section className="mb-8">
            <div className="rounded-r-lg border-l-4 border-apex-primary bg-apex-surface-container/50 p-4">
              <h2 className={cn(sectionEyebrowClassName, "mb-2")}>
                What it does
              </h2>
              <p className="text-sm leading-relaxed text-apex-on-surface-variant">
                The Apex Agent runs locally on your computer and automatically
                detects when you complete a session in supported simulators. It
                uploads your telemetry data to Apex so you can track your
                progress without any manual work.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className={cn(sectionEyebrowClassName, "mb-4")}>
              Supported simulators
            </h2>
            <div className="space-y-3">
              {SUPPORTED_SIMS.map((sim) => {
                const isSupported = sim.support[selectedOs];
                return (
                  <div
                    key={sim.name}
                    className="rounded-lg border border-[#2a2a2a] bg-apex-surface-container p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {isSupported ? (
                          <Check
                            className="size-5 shrink-0 text-apex-primary"
                            aria-hidden
                          />
                        ) : (
                          <sim.icon
                            className="size-5 shrink-0 text-apex-on-surface-variant/50"
                            aria-hidden
                          />
                        )}
                        <span className="font-medium text-apex-on-surface">
                          {sim.name}
                        </span>
                      </div>
                      <span className="text-xs text-apex-on-surface-variant">
                        {simStatusLabel(isSupported)}
                      </span>
                    </div>
                    <p className="mt-1.5 pl-8 text-xs text-apex-on-surface-variant">
                      {sim.detail[selectedOs]}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="mb-10 rounded-lg border border-[#2a2a2a] bg-[#121212] p-4">
            <p className="text-xs leading-relaxed text-apex-on-surface-variant">
              <span className="mr-1 font-bold uppercase text-apex-on-surface">
                Status:
              </span>
              Runs locally and uploads sessions automatically when you finish
              driving.
            </p>
          </div>

          <AgentInstallRequirements os={selectedOs} />

          <section className="mb-8">
            <h2 className={cn(sectionEyebrowClassName, "mb-4")}>
              After you install
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-apex-surface-container p-6">
              <ol className="space-y-3 text-sm text-apex-on-surface-variant">
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] text-xs font-medium text-apex-on-surface">
                    1
                  </span>
                  <span>
                    Open Apex Agent from your{" "}
                    {selectedOs === "macos" ? "menu bar" : "system tray"} (look
                    for the Apex icon).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] text-xs font-medium text-apex-on-surface">
                    2
                  </span>
                  <span>
                    Sign in with the{" "}
                    <strong className="font-medium text-apex-on-surface">
                      same email and password
                    </strong>{" "}
                    as your {COMPANY_NAME} account. No separate activation code
                    is required.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] text-xs font-medium text-apex-on-surface">
                    3
                  </span>
                  <span>
                    The agent minimizes to the{" "}
                    {selectedOs === "macos" ? "menu bar" : "system tray"} and
                    uploads sessions automatically while you race.
                  </span>
                </li>
              </ol>
            </div>
          </section>

          <div className="mb-8">
            {authLoading ? (
              <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#121212] px-4 py-3 text-sm text-apex-on-surface-variant">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking subscription…
              </div>
            ) : isPro ? (
              <>
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  disabled={isDownloading}
                  aria-label={`Download ${downloadFilename}`}
                  className={cn(
                    appPrimaryButtonClassName,
                    "flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 sm:px-8",
                  )}
                >
                  {isDownloading ? (
                    <>
                      <Loader2
                        className="size-4 shrink-0 animate-spin"
                        aria-hidden
                      />
                      Preparing download…
                    </>
                  ) : (
                    <>
                      <Download className="size-4 shrink-0" aria-hidden />
                      {/* The filename is too wide to sit inline on a phone; it
                          moves to the caption below instead of wrapping. */}
                      <span>Download</span>
                      <span className="hidden sm:inline">
                        {downloadFilename}
                      </span>
                    </>
                  )}
                </button>
                {!isDownloading && (
                  <p className="mt-2 text-center font-apex-body text-xs text-apex-on-surface-variant sm:hidden">
                    {downloadFilename}
                  </p>
                )}
              </>
            ) : (
              <AgentProUpgradeCard
                onUpgradeClick={() => setUpgradeModalOpen(true)}
              />
            )}
          </div>

          <div className="flex justify-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to Home
            </Link>
          </div>
        </div>
      </div>

      <AgentUpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        selectedOs={selectedOs}
      />
    </>
  );
}
