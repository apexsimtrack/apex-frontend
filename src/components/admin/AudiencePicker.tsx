import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { wholeNumberInputProps } from "@/lib/inputGuards";
import { withRequestId } from "@/lib/api/errors";
import {
  fetchAdminUserList,
  previewAudience,
  type AdminUserListRow,
  type AudienceDescriptor,
  type AdvancedAudienceFilter,
  type NotificationAudienceType,
} from "@/lib/api";

interface AudiencePickerProps {
  value: AudienceDescriptor;
  onChange: (next: AudienceDescriptor) => void;
}

const TYPE_OPTIONS: {
  id: NotificationAudienceType;
  label: string;
  description: string;
}[] = [
  {
    id: "ALL",
    label: "All users",
    description: "Every active, non-suspended user",
  },
  { id: "ROLE", label: "By role", description: "Users with a specific role" },
  {
    id: "PLAN",
    label: "By plan",
    description: "Users on a specific plan (FREE/PRO)",
  },
  {
    id: "USER_IDS",
    label: "Specific users",
    description: "Pick individual users by email",
  },
  {
    id: "FILTER",
    label: "Advanced filter",
    description: "Combine multiple criteria",
  },
];

export function AudiencePicker({ value, onChange }: AudiencePickerProps) {
  const update = (patch: Partial<AudienceDescriptor>) =>
    onChange({ ...value, ...patch });

  const updateFilter = (patch: Partial<AdvancedAudienceFilter>) => {
    const next: AdvancedAudienceFilter = {
      ...(value.audienceFilter ?? {}),
      ...patch,
    };
    onChange({ ...value, audienceFilter: next });
  };

  // --- Live audience preview -----------------------------------------------
  const debounced = useDebouncedValue(value, 350);
  const previewQuery = useQuery({
    queryKey: ["admin", "notifications", "audience-preview", debounced],
    queryFn: () => previewAudience(debounced),
    staleTime: 10_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TYPE_OPTIONS.map((opt) => {
          const active = value.audienceType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ audienceType: opt.id })}
              className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <span className="text-sm font-semibold text-foreground">
                {opt.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>

      {value.audienceType === "ROLE" && (
        <RoleField
          role={value.audienceRole ?? null}
          onChange={(role) => update({ audienceRole: role })}
        />
      )}

      {value.audienceType === "PLAN" && (
        <PlanField
          plan={value.audiencePlan ?? null}
          onChange={(plan) => update({ audiencePlan: plan })}
        />
      )}

      {value.audienceType === "USER_IDS" && (
        <UserPicker
          selectedIds={value.audienceUserIds ?? []}
          onChange={(ids) => update({ audienceUserIds: ids })}
        />
      )}

      {value.audienceType === "FILTER" && (
        <FilterFields
          filter={value.audienceFilter ?? {}}
          onChange={updateFilter}
        />
      )}

      {/* Live preview card */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 text-sm">
          {previewQuery.isPending ? (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
          <span className="font-semibold text-foreground">
            Audience preview:{" "}
            {previewQuery.data ? (
              <>
                {previewQuery.data.count} user
                {previewQuery.data.count === 1 ? "" : "s"}
              </>
            ) : previewQuery.isError ? (
              <span className="text-destructive">
                {withRequestId("error", previewQuery.error)}
              </span>
            ) : (
              <span className="text-muted-foreground">computing…</span>
            )}
          </span>
        </div>
        {previewQuery.data?.sample.length ? (
          <p className="mt-1 text-xs text-muted-foreground">
            e.g.{" "}
            {previewQuery.data.sample
              .slice(0, 5)
              .map((u) => u.email)
              .join(", ")}
            {previewQuery.data.count > 5
              ? ` and ${previewQuery.data.count - 5} more`
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RoleField({
  role,
  onChange,
}: {
  role: "USER" | "ADMIN" | null;
  onChange: (next: "USER" | "ADMIN") => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm text-muted-foreground">Role</Label>
      <select
        className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
        value={role ?? ""}
        onChange={(e) => onChange(e.target.value as "USER" | "ADMIN")}
      >
        <option value="" disabled>
          Select…
        </option>
        <option value="USER">USER (regular)</option>
        <option value="ADMIN">ADMIN</option>
      </select>
    </div>
  );
}

function PlanField({
  plan,
  onChange,
}: {
  plan: "FREE" | "PRO" | null;
  onChange: (next: "FREE" | "PRO") => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm text-muted-foreground">Plan</Label>
      <select
        className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
        value={plan ?? ""}
        onChange={(e) => onChange(e.target.value as "FREE" | "PRO")}
      >
        <option value="" disabled>
          Select…
        </option>
        <option value="FREE">FREE</option>
        <option value="PRO">PRO</option>
      </select>
    </div>
  );
}

function UserPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);

  const searchQuery = useQuery({
    queryKey: ["admin", "notifications", "user-search", debounced],
    queryFn: () => fetchAdminUserList({ q: debounced, pageSize: 8 }),
    enabled: debounced.trim().length > 0,
    staleTime: 10_000,
  });

  const idSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Resolve display names for already-selected ids (best-effort lookup as user types).
  const [labelMap, setLabelMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!searchQuery.data) return;
    setLabelMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const u of searchQuery.data.items) {
        if (next[u.id] !== u.email) {
          next[u.id] = u.email;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchQuery.data]);

  const addUser = (u: AdminUserListRow) => {
    if (idSet.has(u.id)) return;
    setLabelMap((m) => ({ ...m, [u.id]: u.email }));
    onChange([...selectedIds, u.id]);
  };
  const removeUser = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm text-muted-foreground">
        Search users by email or name
      </Label>
      <Input
        placeholder="Type to search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {debounced.trim().length > 0 && searchQuery.data?.items ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-white/10 bg-card">
          {searchQuery.data.items.length === 0 ? (
            <li className="p-2 text-xs text-muted-foreground">No matches</li>
          ) : (
            searchQuery.data.items.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-white/5"
              >
                <span className="truncate">
                  <span className="font-medium">{u.email}</span>
                  {u.displayName && u.displayName !== u.email ? (
                    <span className="ml-1 text-muted-foreground">
                      ({u.displayName})
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={idSet.has(u.id) ? "outline" : "default"}
                  onClick={() => addUser(u)}
                  disabled={idSet.has(u.id)}
                >
                  {idSet.has(u.id) ? "Added" : "Add"}
                </Button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {selectedIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">No users selected.</p>
        ) : (
          selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs"
            >
              {labelMap[id] ?? id}
              <button
                type="button"
                onClick={() => removeUser(id)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                aria-label="Remove"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function FilterFields({
  filter,
  onChange,
}: {
  filter: AdvancedAudienceFilter;
  onChange: (patch: Partial<AdvancedAudienceFilter>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FilterSelect
        label="Role"
        value={filter.role ?? ""}
        options={[
          { value: "", label: "Any" },
          { value: "USER", label: "USER" },
          { value: "ADMIN", label: "ADMIN" },
        ]}
        onChange={(v) =>
          onChange({ role: v === "" ? null : (v as "USER" | "ADMIN") })
        }
      />
      <FilterSelect
        label="Plan"
        value={filter.plan ?? ""}
        options={[
          { value: "", label: "Any" },
          { value: "FREE", label: "FREE" },
          { value: "PRO", label: "PRO" },
        ]}
        onChange={(v) =>
          onChange({ plan: v === "" ? null : (v as "FREE" | "PRO") })
        }
      />
      <FilterSelect
        label="Profile visibility"
        value={
          filter.privateProfile === true
            ? "private"
            : filter.privateProfile === false
              ? "public"
              : ""
        }
        options={[
          { value: "", label: "Any" },
          { value: "public", label: "Public only" },
          { value: "private", label: "Private only" },
        ]}
        onChange={(v) =>
          onChange({
            privateProfile: v === "" ? null : v === "private",
          })
        }
      />
      <FilterSelect
        label="Email verified"
        value={
          filter.emailVerified === true
            ? "yes"
            : filter.emailVerified === false
              ? "no"
              : ""
        }
        options={[
          { value: "", label: "Any" },
          { value: "yes", label: "Verified only" },
          { value: "no", label: "Unverified only" },
        ]}
        onChange={(v) =>
          onChange({ emailVerified: v === "" ? null : v === "yes" })
        }
      />
      <FilterSelect
        label="Suspension"
        value={
          filter.suspendedOnly
            ? "suspended-only"
            : filter.includeSuspended
              ? "include"
              : ""
        }
        options={[
          { value: "", label: "Exclude suspended (default)" },
          { value: "include", label: "Include suspended" },
          { value: "suspended-only", label: "Suspended only" },
        ]}
        onChange={(v) =>
          onChange({
            includeSuspended: v === "include" ? true : null,
            suspendedOnly: v === "suspended-only" ? true : null,
          })
        }
      />
      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">
          Min session count
        </Label>
        <Input
          type="number"
          min={0}
          {...wholeNumberInputProps}
          value={filter.minSessionCount ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              minSessionCount:
                raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0),
            });
          }}
          placeholder="0"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">Signup after</Label>
        <Input
          type="date"
          value={filter.signupAfter?.slice(0, 10) ?? ""}
          onChange={(e) =>
            onChange({
              signupAfter: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">Signup before</Label>
        <Input
          type="date"
          value={filter.signupBefore?.slice(0, 10) ?? ""}
          onChange={(e) =>
            onChange({
              signupBefore: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            })
          }
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <select
        className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type { AudienceDescriptor };
