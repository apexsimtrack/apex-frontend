import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Flag,
  Gauge,
  HelpCircle,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PageMeta from "@/components/PageMeta";
import UserAvatar from "@/components/UserAvatar";
import { appPrimaryButtonClassName } from "@/components/app-ui/appButtonClasses";
import { getFounderPublicProfile } from "@/lib/api";
import { STATIC_SEO } from "@/config/seoMeta";
import { cn } from "@/lib/utils";

const SIMS = ["iRacing", "F1 25", "Le Mans Ultimate"] as const;

const FOUNDER_CREDENTIALS = [
  "British GT Championship",
  "Barwell Motorsport",
  "#63 Lamborghini Huracán GT3 Evo2",
] as const;

const DIFFERENTIATORS = [
  {
    icon: Layers,
    label: "Every sim, one place",
    detail:
      "Whether you're setting lap times on iRacing, chasing pole in F1 25, or pushing through the corners of Le Mans Ultimate, your data lives in one place.",
  },
  {
    icon: Gauge,
    label: "Built from the inside",
    detail:
      "Apex was built by someone who knows what it takes to go fast, and what information actually matters when you're trying to get faster.",
  },
  {
    icon: ShieldCheck,
    label: "Comparable & always yours",
    detail:
      "Most tracking tools are built around a single simulator. Apex keeps your performance comparable, consistent, and always yours.",
  },
] as const;

const cardClassName =
  "rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low p-6 sm:p-7";

const sectionEyebrowClassName =
  "font-apex-headline text-[10px] font-semibold uppercase tracking-[0.2em] text-apex-on-surface-variant";

function IconChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex size-10 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary",
        className,
      )}
      aria-hidden
    >
      {children}
    </div>
  );
}

export default function About() {
  const { data: founder } = useQuery({
    queryKey: ["publicProfile", "founder"],
    queryFn: getFounderPublicProfile,
    staleTime: 5 * 60_000,
  });

  return (
    <>
      <PageMeta
        title={STATIC_SEO.about.title}
        description={STATIC_SEO.about.description}
        path={STATIC_SEO.about.path}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        <header>
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Built by a racer.
            <span className="block text-apex-primary sm:inline sm:before:content-['\00a0']">
              Built for racers.
            </span>
          </h1>
          <p className="mt-3 max-w-2xl font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            {STATIC_SEO.about.description}
          </p>
        </header>

        <section className={cardClassName}>
          <p className={sectionEyebrowClassName}>The founder</p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
            <UserAvatar
              name="Hugo Cook"
              avatarUrl={founder?.avatarUrl}
              size="lg"
              alt="Hugo Cook"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                Hugo Cook
              </h2>
              <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
                Founder · Professional racing driver
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {FOUNDER_CREDENTIALS.map((credential) => (
                  <li
                    key={credential}
                    className="rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container px-3 py-1.5 font-apex-body text-xs text-apex-on-surface-variant"
                  >
                    {credential}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={cardClassName}>
          <IconChip>
            <Flag className="size-5" />
          </IconChip>
          <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
            Our story
          </h2>
          <div className="mt-4 space-y-4 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            <p>
              Apex Sim Tracker was founded by Hugo Cook — a professional racing
              driver competing in the British GT Championship with Barwell
              Motorsport, driving the #63 Lamborghini Huracán GT3 Evo2.
            </p>
            <p>
              As a racing driver, Hugo understood better than anyone the role
              that sim racing plays in modern motorsport preparation. But when
              it came to tracking performance across multiple simulators, the
              tools simply didn&apos;t exist. Session data lived in scattered
              spreadsheets, there was no way to spot trends across different
              sims, and no platform that treated sim racing with the seriousness
              it deserved.
            </p>
            <p className="border-l-2 border-apex-primary pl-3 font-apex-body font-semibold text-apex-on-surface">
              So he built it.
            </p>
            <p>
              Apex Sim Tracker brings together everything a sim racer needs to
              understand and improve their performance — session logging,
              detailed stats, telemetry, leaderboards, and rule-based Apex
              Analysis coaching insights — all in one place, across every
              simulator you use.
            </p>
          </div>
        </section>

        <section className="rounded-r-xl border-l-4 border-apex-primary bg-apex-surface-container/50 p-6 sm:p-7">
          <IconChip>
            <Sparkles className="size-5" />
          </IconChip>
          <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
            Our mission
          </h2>
          <div className="mt-4 space-y-4 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            <p>
              Sim racing is no longer just a hobby. It&apos;s how drivers train,
              how talent gets discovered, and how a generation of racers is
              pushing the boundaries of what&apos;s possible behind a wheel. We
              believe those drivers deserve professional-grade tools to match
              their ambition.
            </p>
            <p className="font-apex-body font-medium text-apex-on-surface">
              Our mission is simple: give every sim racer — from weekend warrior
              to esports professional — the data and insights they need to find
              the limit and go beyond it.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
            What makes us different
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {DIFFERENTIATORS.map(({ icon: Icon, label, detail }) => (
              <div
                key={label}
                className="rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low p-5"
              >
                <div
                  className="mb-3 flex size-9 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary"
                  aria-hidden
                >
                  <Icon className="size-4" />
                </div>
                <h3 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                  {label}
                </h3>
                <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
              One place for every sim
            </h2>
            <p className="mt-2 max-w-xl font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
              Compare and track progress across the titles you already run — no
              more siloed spreadsheets.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {SIMS.map((name) => (
              <li
                key={name}
                className="rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container px-3 py-1.5 font-apex-headline text-sm text-apex-on-surface transition-colors hover:border-apex-primary/40"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>

        <section
          className={cn(
            cardClassName,
            "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <div className="flex gap-4">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary"
              aria-hidden
            >
              <HelpCircle className="size-5" />
            </div>
            <div>
              <p className="font-apex-body text-sm font-medium text-apex-on-surface">
                Have questions about Apex?
              </p>
              <p className="mt-1 max-w-sm font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Plans, sessions, Apex Pro, and more — we&apos;ve answered the
                common ones in our FAQ.
              </p>
            </div>
          </div>
          <Button
            asChild
            className={cn(
              "shrink-0 !px-5 !py-2 !text-xs",
              appPrimaryButtonClassName,
            )}
          >
            <Link to="/faq">
              Read the FAQ
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </div>
    </>
  );
}
