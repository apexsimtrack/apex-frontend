import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Database,
  HelpCircle,
  Info,
  MessageCircle,
  Search,
  SearchX,
  Sparkles,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import PageMeta from "@/components/PageMeta";
import { appPrimaryButtonClassName } from "@/components/app-ui/appButtonClasses";
import {
  FAQ_CATEGORY_ORDER,
  FAQ_ITEMS,
  filterFaqItems,
  groupFaqByCategory,
  type FaqItem,
} from "@/lib/faqData";
import { STATIC_SEO } from "@/config/seoMeta";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  General: Info,
  "Sessions & Data": Database,
  "Apex Pro": Sparkles,
  Account: UserCog,
};

const FILTER_CHIPS = ["All", ...FAQ_CATEGORY_ORDER] as const;

const categoryCounts = Object.fromEntries([
  ["All", FAQ_ITEMS.length],
  ...FAQ_CATEGORY_ORDER.map((cat) => [
    cat,
    FAQ_ITEMS.filter((item) => item.category === cat).length,
  ]),
]) as Record<(typeof FILTER_CHIPS)[number], number>;

export default function FAQ() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const bySearch = filterFaqItems(FAQ_ITEMS, query);
    if (!category) return bySearch;
    return bySearch.filter((item) => item.category === category);
  }, [query, category]);

  const sections = useMemo(() => groupFaqByCategory(filtered), [filtered]);

  const total = FAQ_ITEMS.length;
  const shown = filtered.length;
  const showEmpty =
    (query.trim().length > 0 || category !== null) && shown === 0;

  const resetFilters = () => {
    setQuery("");
    setCategory(null);
    inputRef.current?.focus();
  };

  return (
    <>
      <PageMeta
        title={STATIC_SEO.faq.title}
        description={STATIC_SEO.faq.description}
        path={STATIC_SEO.faq.path}
        jsonLd={STATIC_SEO.faq.jsonLd}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        <section className="mb-1">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Frequently Asked Questions
          </h1>
          <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
            Search by keyword to jump to an answer, or browse the topics below.
            Still stuck? Reach out via the support email in the footer.
          </p>
        </section>

        <div className="space-y-5">
          <div className="relative">
            <label htmlFor="faq-search" className="sr-only">
              Search frequently asked questions
            </label>
            <Search
              className="absolute left-3 top-3 size-4 text-apex-on-surface-variant/60"
              aria-hidden
            />
            <input
              ref={inputRef}
              id="faq-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions and answers…"
              autoComplete="off"
              spellCheck={false}
              aria-controls="faq-accordion"
              className="w-full rounded-lg border border-apex-outline-variant/15 bg-apex-surface-container py-2.5 pl-10 pr-16 font-apex-body text-sm text-apex-on-surface transition-colors placeholder:text-apex-on-surface-variant/60 focus:border-apex-primary/40 focus:outline-none"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 font-apex-body text-xs text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {FILTER_CHIPS.map((chip) => {
              const isAll = chip === "All";
              const isActive = isAll ? category === null : category === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setCategory(isAll ? null : chip)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded p-2 font-apex-body text-[10px] font-bold uppercase transition-colors",
                    isActive
                      ? "bg-apex-primary text-white"
                      : "bg-apex-surface-container-low text-apex-on-surface-variant",
                  )}
                  aria-pressed={isActive}
                >
                  <span className="truncate">{chip}</span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      isActive
                        ? "text-white/80"
                        : "text-apex-on-surface-variant/60",
                    )}
                  >
                    ({categoryCounts[chip]})
                  </span>
                </button>
              );
            })}
          </section>

          <p
            className="font-apex-body text-xs text-apex-on-surface-variant"
            aria-live="polite"
          >
            Showing {shown} of {total} questions
          </p>
        </div>

        {showEmpty ? (
          <div
            className="rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low px-6 py-10 text-center"
            role="status"
          >
            <div
              className="mx-auto mb-4 flex size-10 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary"
              aria-hidden
            >
              <SearchX className="size-5" />
            </div>
            <p className="mb-6 font-apex-body text-sm text-apex-on-surface-variant">
              No questions found matching your search.
            </p>
            <Button
              type="button"
              onClick={resetFilters}
              className={appPrimaryButtonClassName}
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <FaqAccordion sections={sections} query={query} />
        )}

        <section className="rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary"
                aria-hidden
              >
                <MessageCircle className="size-5" />
              </div>
              <div>
                <p className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                  Still have questions?
                </p>
                <p className="mt-1 max-w-sm font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                  Can&apos;t find what you&apos;re looking for? Our support team
                  is here to help.
                </p>
              </div>
            </div>
            <Button
              asChild
              className="shrink-0 rounded-apex-sm bg-apex-primary px-4 py-2 font-apex-body text-xs font-semibold text-white transition-colors hover:bg-apex-primary/90"
            >
              <Link to="/contact">Contact support</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function FaqAccordion({
  sections,
  query,
}: {
  sections: { category: string; items: FaqItem[] }[];
  query: string;
}) {
  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  if (totalItems === 0) return null;

  return (
    <div id="faq-accordion" className="w-full space-y-10">
      {sections.map(({ category, items }) => (
        <FaqCategorySection
          key={category}
          category={category}
          items={items}
          query={query}
        />
      ))}
    </div>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] ?? HelpCircle;
  return <Icon className="size-4" />;
}

function FaqCategorySection({
  category,
  items,
  query,
}: {
  category: string;
  items: FaqItem[];
  query: string;
}) {
  const [openValue, setOpenValue] = useState<string>("");

  useEffect(() => {
    if (query.trim()) {
      setOpenValue("");
    }
  }, [query]);

  const sectionSlug = slugify(category);

  return (
    <section aria-labelledby={`faq-section-${sectionSlug}`}>
      <div className="flex items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary"
          aria-hidden
        >
          <CategoryIcon category={category} />
        </div>
        <h2
          id={`faq-section-${sectionSlug}`}
          className="font-apex-headline text-lg font-semibold text-apex-on-surface"
        >
          {category}
        </h2>
        <span className="rounded-apex-sm bg-apex-surface-container px-2 py-0.5 font-apex-body text-[11px] font-medium text-apex-on-surface-variant">
          {items.length}
        </span>
      </div>
      <Accordion
        type="single"
        collapsible
        value={openValue}
        onValueChange={setOpenValue}
        className="mt-4 w-full space-y-2"
      >
        {items.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="group overflow-hidden rounded-xl border border-b-0 border-apex-outline-variant/15 bg-apex-surface-container-low transition-colors hover:bg-apex-surface-container data-[state=open]:border-apex-primary data-[state=open]:bg-apex-surface-container"
          >
            <AccordionTrigger className="w-full p-4 text-left font-apex-headline text-sm text-apex-on-surface hover:bg-transparent hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apex-primary focus-visible:ring-offset-2 focus-visible:ring-offset-apex-background [&[data-state=open]]:text-apex-on-surface">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}
