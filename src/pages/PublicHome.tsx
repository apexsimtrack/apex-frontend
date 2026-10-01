import PageMeta from "@/components/PageMeta";
import PublicHomeBrowseSection from "./public-home/PublicHomeBrowseSection";
import PublicHomeFeatureGrid from "./public-home/PublicHomeFeatureGrid";
import PublicHomeFinalCta from "./public-home/PublicHomeFinalCta";
import PublicHomeFounderCard from "./public-home/PublicHomeFounderCard";
import PublicHomeFaqStrip from "./public-home/PublicHomeFaqStrip";
import PublicHomeHero from "./public-home/PublicHomeHero";
import PublicHomeProSection from "./public-home/PublicHomeProSection";
import PublicHomeSimsSection from "./public-home/PublicHomeSimsSection";
import { STATIC_SEO } from "@/config/seoMeta";
import { PUBLIC_HOME_PATH } from "./public-home/publicHomeShared";

export default function PublicHome() {
  return (
    <>
      <PageMeta
        title={STATIC_SEO.home.title}
        description={STATIC_SEO.home.description}
        path={PUBLIC_HOME_PATH}
      />
      <div className="relative w-full overflow-x-hidden">
        <div
          className="pointer-events-none absolute left-0 top-0 h-[min(42vw,18rem)] w-[min(40vw,17rem)] -translate-x-1/4 translate-y-1/3 rounded-full opacity-[0.16] blur-[72px] sm:opacity-[0.2] lg:h-[22rem] lg:w-[20rem] lg:opacity-[0.24] lg:blur-[88px]"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--apex-primary) / 0.14) 0%, hsl(var(--apex-primary) / 0.06) 58%, transparent 75%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-0 top-0 h-[min(42vw,18rem)] w-[min(40vw,17rem)] translate-x-1/4 translate-y-1/3 rounded-full opacity-[0.16] blur-[72px] sm:opacity-[0.2] lg:h-[22rem] lg:w-[20rem] lg:opacity-[0.24] lg:blur-[88px]"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--apex-primary) / 0.14) 0%, hsl(var(--apex-primary) / 0.06) 58%, transparent 75%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
          <PublicHomeHero />
          <PublicHomeFeatureGrid />
          <PublicHomeBrowseSection />
          <PublicHomeSimsSection />
          <PublicHomeFounderCard />
          <PublicHomeProSection />
          <PublicHomeFaqStrip />
          <PublicHomeFinalCta />
        </div>
      </div>
    </>
  );
}
