import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  appModalCancelButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";

import type { AgentOs } from "@/hooks/useDetectedAgentOs";

type AgentUpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  selectedOs: AgentOs;
};

export default function AgentUpgradeModal({
  open,
  onClose,
  selectedOs,
}: AgentUpgradeModalProps) {
  const navigate = useNavigate();

  return (
    <AppBaseModal
      isOpen={open}
      onClose={onClose}
      title="Apex Pro Required"
      description="Automatic telemetry uploads and the Apex Agent installer are available with Apex Pro."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={cn(
              appModalCancelButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={onClose}
          >
            Not now
          </button>
          <button
            type="button"
            className={cn(
              appPrimaryButtonClassName,
              "inline-flex items-center justify-center px-4 py-2",
            )}
            onClick={() => {
              onClose();
              navigate("/pricing");
            }}
          >
            Upgrade to Pro
          </button>
        </div>
      }
    >
      <ul className="space-y-2 font-apex-body text-sm text-apex-on-surface-variant">
        <li className="flex items-start gap-2">
          <CheckCircle
            className="mt-0.5 size-4 shrink-0 text-apex-success"
            aria-hidden
          />
          Background F1 25 UDP telemetry capture
        </li>
        {selectedOs === "windows" && (
          <li className="flex items-start gap-2">
            <CheckCircle
              className="mt-0.5 size-4 shrink-0 text-apex-success"
              aria-hidden
            />
            Automatic iRacing session log uploads
          </li>
        )}
        {selectedOs === "windows" && (
          <li className="flex items-start gap-2">
            <CheckCircle
              className="mt-0.5 size-4 shrink-0 text-apex-success"
              aria-hidden
            />
            Automatic Le Mans Ultimate telemetry uploads
          </li>
        )}
        <li className="flex items-start gap-2">
          <CheckCircle
            className="mt-0.5 size-4 shrink-0 text-apex-success"
            aria-hidden
          />
          Unlimited session history and full analytics
        </li>
      </ul>
    </AppBaseModal>
  );
}
