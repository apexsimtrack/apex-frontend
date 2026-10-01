import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormRootMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { wholeNumberInputProps } from "@/lib/inputGuards";
import type { WithRootError } from "@/lib/formWithRootError";
import {
  getProfileHomeWeekly,
  patchWeeklyGoals,
} from "@/lib/api/profile";
import { withRequestId } from "@/lib/api/errors";
import { useAuth } from "@/contexts/AuthContext";
import {
  ownedProfileUserKey,
  profileKeys,
} from "@/lib/profileQueryKeys";
import {
  appAccountInputClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { SettingsSectionChrome } from "./SettingsSectionChrome";

const DEFAULT_RACES = 10;
const DEFAULT_PODIUMS = 5;
const DEFAULT_LAPS = 100;

const weeklyGoalsFormSchema = z.object({
  weeklyRacesTarget: z
    .number()
    .int("Must be a whole number.")
    .min(1, "Must be at least 1.")
    .max(1000, "Must be 1000 or less."),
  weeklyPodiumsTarget: z
    .number()
    .int("Must be a whole number.")
    .min(1, "Must be at least 1.")
    .max(1000, "Must be 1000 or less."),
  weeklyLapsTarget: z
    .number()
    .int("Must be a whole number.")
    .min(1, "Must be at least 1.")
    .max(10000, "Must be 10000 or less."),
});

type WeeklyGoalsFormValues = z.infer<typeof weeklyGoalsFormSchema>;

const FIELDS: Array<{
  name: keyof WeeklyGoalsFormValues;
  label: string;
  hint: string;
}> = [
  {
    name: "weeklyRacesTarget",
    label: "Races",
    hint: "Race sessions per week",
  },
  {
    name: "weeklyPodiumsTarget",
    label: "Podiums",
    hint: "Top-3 finishes per week",
  },
  {
    name: "weeklyLapsTarget",
    label: "Laps",
    hint: "Total laps driven per week",
  },
];

export default function SettingsWeeklyGoalsSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userKey = ownedProfileUserKey(user);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: profileKeys.homeWeekly(userKey),
    queryFn: getProfileHomeWeekly,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const defaults = useMemo<WeeklyGoalsFormValues>(
    () => ({
      weeklyRacesTarget: data?.weeklyGoals?.races.target ?? DEFAULT_RACES,
      weeklyPodiumsTarget: data?.weeklyGoals?.podiums.target ?? DEFAULT_PODIUMS,
      weeklyLapsTarget: data?.weeklyGoals?.laps.target ?? DEFAULT_LAPS,
    }),
    [data],
  );

  const form = useForm<WithRootError<WeeklyGoalsFormValues>>({
    resolver: zodResolver(weeklyGoalsFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const watched = form.watch();
  const dirty =
    watched.weeklyRacesTarget !== defaults.weeklyRacesTarget ||
    watched.weeklyPodiumsTarget !== defaults.weeklyPodiumsTarget ||
    watched.weeklyLapsTarget !== defaults.weeklyLapsTarget;
  const saveDisabled = !dirty || saving || !form.formState.isValid || isPending;

  async function onSubmit(values: WeeklyGoalsFormValues) {
    if (saving || !dirty) return;
    setSaving(true);
    setSuccess(false);
    form.clearErrors("root");
    try {
      await patchWeeklyGoals({
        weeklyRacesTarget: values.weeklyRacesTarget,
        weeklyPodiumsTarget: values.weeklyPodiumsTarget,
        weeklyLapsTarget: values.weeklyLapsTarget,
      });
      void queryClient.invalidateQueries({
        queryKey: ["profile", "homeWeekly"],
      });
      void queryClient.invalidateQueries({ queryKey: ["profile", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions-library"] });
      form.reset(values);
      setSuccess(true);
      toast.success("Weekly goals updated");
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      const message = withRequestId(
        e instanceof Error ? e.message : "Failed to update weekly goals.",
        e,
      );
      form.setError("root", { type: "server", message });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSectionChrome title="Weekly goals">
      <p className="mb-4 font-apex-body text-xs text-apex-on-surface-variant">
        Targets for Dashboard and Sessions weekly progress. Defaults are{" "}
        {DEFAULT_RACES} races, {DEFAULT_PODIUMS} podiums, and {DEFAULT_LAPS}{" "}
        laps.
      </p>
      {isPending ? (
        <p className="font-apex-body text-sm text-apex-on-surface-variant">
          Loading goals…
        </p>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4">
              {FIELDS.map((field) => (
                <FormField
                  key={field.name}
                  control={form.control}
                  name={field.name}
                  render={({ field: rhf }) => (
                    <FormItem className="space-y-1">
                      <label
                        htmlFor={`settings-${field.name}`}
                        className="font-apex-body text-[10px] uppercase text-apex-on-surface-variant"
                      >
                        {field.label}
                      </label>
                      <FormControl>
                        <Input
                          id={`settings-${field.name}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={
                            field.name === "weeklyLapsTarget" ? 10000 : 1000
                          }
                          disabled={saving}
                          className={appAccountInputClassName}
                          {...wholeNumberInputProps}
                          name={rhf.name}
                          ref={rhf.ref}
                          onBlur={rhf.onBlur}
                          value={
                            Number.isFinite(rhf.value) ? rhf.value : ""
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              rhf.onChange(NaN);
                            } else {
                              rhf.onChange(Number(raw));
                            }
                            form.clearErrors("root");
                          }}
                        />
                      </FormControl>
                      <p className="font-apex-body text-[10px] text-apex-on-surface-variant">
                        {field.hint}
                      </p>
                      <FormMessage className="text-xs text-apex-error" />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormRootMessage className="text-xs text-apex-error" />
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={saveDisabled}
                className={appPrimaryButtonClassName}
              >
                {saving ? (
                  <>
                    <Loader2
                      className="mr-2 size-4 animate-spin"
                      aria-hidden
                    />
                    Saving…
                  </>
                ) : (
                  "Save goals"
                )}
              </Button>
              {success ? (
                <p className="text-xs text-apex-success">Saved</p>
              ) : null}
            </div>
          </form>
        </Form>
      )}
    </SettingsSectionChrome>
  );
}
