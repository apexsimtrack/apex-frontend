import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptAttributeForAgentOs,
  fetchAdminAgentDownloadLogs,
  fetchAdminAgentMinUploadVersion,
  fetchAdminAgentReleases,
  fetchAdminAgentReleaseSummary,
  publishAdminAgentRelease,
  setAdminAgentMinUploadVersion,
  validateAgentInstallerFile,
  verifyAdminAgentReleases,
  type AdminAgentReleaseSummaryItem,
  type AgentOs,
} from "@/lib/api";
import { withRequestId, apiErrorText, ApiError } from "@/lib/api/errors";
import {
  agentReleaseFloorWarnings,
  isMajorMinorPatch,
} from "@/pages/admin/agentReleaseFloorWarnings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";

const OS_LABELS: Record<AgentOs, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

type UploadPhase = "idle" | "bytes" | "processing";

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return "—";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : "—";
}

export function AdminAgentReleasesPanel() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadOs, setUploadOs] = useState<AgentOs>("macos");
  const [uploadVersion, setUploadVersion] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [floorInput, setFloorInput] = useState("");

  const isUploading = uploadPhase !== "idle";

  const summaryQuery = useQuery({
    queryKey: ["admin", "agent", "releases", "summary"],
    queryFn: fetchAdminAgentReleaseSummary,
  });

  const floorQuery = useQuery({
    queryKey: ["admin", "agent", "min-upload-version"],
    queryFn: fetchAdminAgentMinUploadVersion,
  });

  useEffect(() => {
    if (!floorQuery.isSuccess) return;
    setFloorInput(floorQuery.data.version ?? "");
  }, [floorQuery.isSuccess, floorQuery.data]);

  const historyQuery = useQuery({
    queryKey: ["admin", "agent", "releases", "history", { page: 1 }],
    queryFn: () => fetchAdminAgentReleases({ page: 1, pageSize: 20 }),
  });

  const downloadsQuery = useQuery({
    queryKey: ["admin", "agent", "downloads", { page: 1 }],
    queryFn: () => fetchAdminAgentDownloadLogs({ page: 1, pageSize: 50 }),
  });

  const summaryByOs = useMemo(() => {
    const map = new Map<AgentOs, AdminAgentReleaseSummaryItem>();
    for (const row of summaryQuery.data ?? []) {
      map.set(row.os, row);
    }
    return map;
  }, [summaryQuery.data]);

  const floorWarnings = useMemo(
    () =>
      agentReleaseFloorWarnings(
        floorQuery.data?.version ?? null,
        (["macos", "windows", "linux"] as const).map((os) => ({
          os,
          version: summaryByOs.get(os)?.activeRelease?.version ?? null,
        })),
      ),
    [floorQuery.data?.version, summaryByOs],
  );

  function latestVersionLabel(
    row: AdminAgentReleaseSummaryItem | undefined,
  ): string {
    if (row?.activeRelease?.version) return row.activeRelease.version;
    if (row?.r2ObjectExists) return "On R2 (no version registered)";
    return "No release";
  }

  function handleFileChange(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const check = validateAgentInstallerFile(uploadOs, file);
    if (check.ok === false) {
      toast.error(check.message);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
  }

  function handleOsChange(nextOs: AgentOs) {
    setUploadOs(nextOs);
    if (selectedFile) {
      const check = validateAgentInstallerFile(nextOs, selectedFile);
      if (check.ok === false) {
        toast.error(check.message);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }

  const floorMutation = useMutation({
    mutationFn: async () => {
      const trimmed = floorInput.trim();
      if (trimmed && !isMajorMinorPatch(trimmed)) {
        throw new Error("version must be major.minor.patch");
      }
      return setAdminAgentMinUploadVersion(trimmed ? trimmed : null);
    },
    onSuccess: async (saved) => {
      setFloorInput(saved.version ?? "");
      toast.success(
        saved.version ? "Upload floor saved." : "Upload floor cleared.",
      );
      await qc.invalidateQueries({
        queryKey: ["admin", "agent", "min-upload-version"],
      });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        toast.error(apiErrorText(e, "Could not save the upload floor."));
        return;
      }
      toast.error(
        e instanceof Error ? e.message : "Could not save the upload floor.",
      );
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyAdminAgentReleases,
    onSuccess: async () => {
      toast.success("R2 release objects verified.");
      await qc.invalidateQueries({ queryKey: ["admin", "agent"] });
    },
    onError: (e: unknown) => {
      toast.error(apiErrorText(e, "Verification failed."));
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const fileCheck = validateAgentInstallerFile(uploadOs, selectedFile);
      if (fileCheck.ok === false) throw new Error(fileCheck.message);
      if (!uploadVersion.trim()) throw new Error("Version is required.");
      if (!isMajorMinorPatch(uploadVersion.trim())) {
        throw new Error("version must be major.minor.patch");
      }

      const form = new FormData();
      form.append("os", uploadOs);
      form.append("version", uploadVersion.trim());
      if (uploadNotes.trim()) form.append("notes", uploadNotes.trim());
      form.append("activate", "true");
      form.append("file", selectedFile!);

      setUploadPhase("bytes");
      setUploadPercent(0);

      return publishAdminAgentRelease(form, {
        onUploadProgress: (p) => {
          setUploadPercent(p);
          if (p >= 100) setUploadPhase("processing");
        },
        onUploadComplete: () => {
          setUploadPhase("processing");
          setUploadPercent(100);
        },
      });
    },
    onSuccess: async () => {
      toast.success("Agent release uploaded.");
      setSelectedFile(null);
      setUploadVersion("");
      setUploadNotes("");
      setUploadPercent(0);
      setUploadPhase("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["admin", "agent"] });
    },
    onError: (e: unknown) => {
      setUploadPercent(0);
      setUploadPhase("idle");
      toast.error(
        withRequestId(e instanceof Error ? e.message : "Upload failed.", e),
      );
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={verifyMutation.isPending || isUploading}
          onClick={() => verifyMutation.mutate()}
        >
          {verifyMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Verify R2 objects
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 bg-card/30 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">Upload floor</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Agents below this version cannot upload.</li>
          <li>Publishing a release does not change this number.</li>
          <li>
            Agents that send no version still upload. That includes installs
            from before this gate.
          </li>
          <li>A saved floor reaches upload within about a minute.</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            placeholder="1.2.3"
            value={floorInput}
            disabled={floorMutation.isPending || floorQuery.isPending}
            onChange={(e) => setFloorInput(e.target.value)}
            aria-label="Minimum upload version"
          />
          <Button
            type="button"
            size="sm"
            disabled={floorMutation.isPending || floorQuery.isPending}
            onClick={() => floorMutation.mutate()}
          >
            {floorMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
        {floorWarnings.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-amber-300">
            {floorWarnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(["macos", "windows", "linux"] as const).map((os) => {
          const row = summaryByOs.get(os);
          const notes = row?.activeRelease?.notes?.trim();
          return (
            <div
              key={os}
              className="rounded-xl border border-white/10 bg-card/30 p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {OS_LABELS[os]} · latest
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {latestVersionLabel(row)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A signed-in agent on an older build sees an update card and can
                still upload. The agent checks at sign-in and then every 6
                hours.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                R2: {row?.r2ObjectExists ? "present" : "missing"} ·{" "}
                {formatBytes(row?.contentLength ?? null)}
              </p>
              {row?.r2ObjectKey ? (
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {row.r2ObjectKey}
                </p>
              ) : null}
              {row?.activeRelease ? (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  SHA {shortSha(row.activeRelease.sha256)}
                </p>
              ) : null}
              {notes ? (
                <p
                  className="mt-2 line-clamp-2 text-xs text-muted-foreground"
                  title={notes}
                >
                  {notes}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-card/30 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Upload release
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Uploads go to{" "}
          <span className="font-mono text-xs">
            agents/latest/ApexAgent-&#123;mac|windows|linux&#125;.*
          </span>{" "}
          in the apex-images bucket and become the active latest release
          automatically.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select
            className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm disabled:opacity-50"
            value={uploadOs}
            disabled={isUploading}
            onChange={(e) => handleOsChange(e.target.value as AgentOs)}
          >
            <option value="macos">macOS (.dmg)</option>
            <option value="windows">Windows (.exe)</option>
            <option value="linux">Linux (.AppImage)</option>
          </select>
          <Input
            placeholder="Version (e.g. 1.2.0)"
            value={uploadVersion}
            disabled={isUploading}
            onChange={(e) => setUploadVersion(e.target.value)}
          />
          <Input
            type="file"
            ref={fileInputRef}
            accept={acceptAttributeForAgentOs(uploadOs)}
            disabled={isUploading}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>
        <Input
          className="mt-3"
          placeholder="Release notes (optional)"
          value={uploadNotes}
          disabled={isUploading}
          onChange={(e) => setUploadNotes(e.target.value)}
        />

        {isUploading ? (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              {uploadPhase === "bytes"
                ? "Uploading installer…"
                : "Finalizing release…"}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-[width] duration-150 ease-out",
                  uploadPhase === "processing" && "animate-pulse",
                )}
                style={{
                  width:
                    uploadPhase === "bytes"
                      ? `${Math.max(0, Math.min(100, uploadPercent))}%`
                      : "100%",
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {uploadPhase === "bytes" ? `${uploadPercent}%` : "Hang tight…"}
            </p>
          </div>
        ) : (
          <Button
            type="button"
            className="mt-4"
            disabled={
              publishMutation.isPending ||
              !selectedFile ||
              !uploadVersion.trim()
            }
            onClick={() => publishMutation.mutate()}
          >
            {publishMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Upload
          </Button>
        )}
      </div>

      <div className={ADMIN_TABLE_CARD}>
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Release history
          </h2>
          <p className="text-xs text-muted-foreground">
            Recent uploads across all platforms.
          </p>
        </div>
        {historyQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No releases recorded yet.
          </p>
        ) : (
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={adminTable("min-w-[56rem]")}>
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className={ADMIN_TH}>Published</th>
                  <th className={ADMIN_TH}>OS</th>
                  <th className={ADMIN_TH}>Version</th>
                  <th className={ADMIN_TH}>Notes</th>
                  <th className={ADMIN_TH}>Active</th>
                  <th className={ADMIN_TH}>Published by</th>
                </tr>
              </thead>
              <tbody>
                {historyQuery.data?.items.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td
                      className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                    >
                      {formatTs(row.publishedAt)}
                    </td>
                    <td className={ADMIN_TD}>{OS_LABELS[row.os]}</td>
                    <td className={ADMIN_TD}>{row.version}</td>
                    <td
                      className={`${ADMIN_TD} max-w-xs whitespace-normal text-muted-foreground`}
                    >
                      {row.notes?.trim() || "—"}
                    </td>
                    <td className={ADMIN_TD}>{row.isActive ? "Yes" : "No"}</td>
                    <td className={`${ADMIN_TD} text-muted-foreground`}>
                      {row.publishedBy?.email ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={ADMIN_TABLE_CARD}>
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Recent downloads
          </h2>
          <p className="text-xs text-muted-foreground">
            Last 50 agent download attempts (audit log).
          </p>
        </div>
        {downloadsQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (downloadsQuery.data?.items.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No download events yet.
          </p>
        ) : (
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={adminTable("min-w-[44rem]")}>
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className={ADMIN_TH}>Time</th>
                  <th className={ADMIN_TH}>User</th>
                  <th className={ADMIN_TH}>OS</th>
                  <th className={ADMIN_TH}>Outcome</th>
                  <th className={ADMIN_TH}>Version</th>
                </tr>
              </thead>
              <tbody>
                {downloadsQuery.data?.items.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td
                      className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                    >
                      {formatTs(row.createdAt)}
                    </td>
                    <td className={ADMIN_TD}>{row.user?.email ?? "—"}</td>
                    <td className={ADMIN_TD}>{OS_LABELS[row.os]}</td>
                    <td className={ADMIN_TD}>{row.outcome}</td>
                    <td className={`${ADMIN_TD} text-muted-foreground`}>
                      {row.version ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
