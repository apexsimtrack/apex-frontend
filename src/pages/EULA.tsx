import { Link } from "react-router-dom";
import PageMeta from "@/components/PageMeta";
import { STATIC_SEO } from "@/config/seoMeta";
import { COMPANY_NAME, SITE_ORIGIN } from "@/lib/siteMeta";
import { SUPPORT_EMAIL } from "@/lib/appConfig";

const linkClassName =
  "text-apex-primary transition-colors hover:text-apex-primary/80";

const codeClassName =
  "rounded-apex-sm bg-apex-surface-container px-1 py-0.5 font-mono text-xs text-apex-on-surface";

const bodyClassName =
  "font-apex-body text-sm leading-relaxed text-apex-on-surface-variant";

const listClassName =
  "list-disc space-y-1.5 pl-5 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant";

const h2ClassName = "font-apex-headline text-lg font-semibold text-apex-on-surface";

export default function EULA() {
  return (
    <>
      <PageMeta
        title={STATIC_SEO.eula.title}
        description={STATIC_SEO.eula.description}
        path={STATIC_SEO.eula.path}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <article className="mx-auto w-full max-w-3xl">
          <header className="mb-10 border-b border-apex-outline-variant/15 pb-8">
            <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
              End User License Agreement (EULA)
            </h1>
            <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
              Apex Agent Desktop Application — Windows, macOS &amp; Linux
            </p>
            <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
              Last updated: 26 June 2026
            </p>
          </header>

          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className={h2ClassName}>1. Agreement</h2>
              <p className={bodyClassName}>
                This End User License Agreement (“EULA”) is a legal agreement
                between you (“User”, “you”) and {COMPANY_NAME} (“Licensor”,
                “we”, “us”, “our”) for the Apex Agent software application
                (“Agent”), including any updates, documentation, and associated
                materials we provide. By downloading, installing, or using the
                Agent, you agree to this EULA. If you do not agree, do not
                install or use the Agent.
              </p>
              <p className={bodyClassName}>
                This EULA supplements our{" "}
                <Link to="/terms-and-conditions" className={linkClassName}>
                  Terms &amp; Conditions
                </Link>{" "}
                and{" "}
                <Link to="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>
                . In the event of conflict regarding the Agent software itself,
                this EULA prevails for software-licence matters; our Terms &amp;
                Conditions prevail for Service usage and subscriptions.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>2. Licence grant</h2>
              <p className={bodyClassName}>
                Subject to your compliance with this EULA and an active{" "}
                {COMPANY_NAME} account with valid Pro entitlement where
                required, we grant you a limited, non-exclusive,
                non-transferable, revocable licence to install and run one copy
                of the Agent on a single computer you own or control, solely to
                upload sim racing session data to your {COMPANY_NAME} account as
                intended by the Service.
              </p>
              <p className={bodyClassName}>
                The Agent is licensed, not sold. We reserve all rights not
                expressly granted.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>
                3. System monitoring and transparency
              </h2>
              <p className={bodyClassName}>
                The Agent performs local monitoring of supported racing
                simulators to extract session summaries. You acknowledge and
                consent to the following behaviours while the Agent is running:
              </p>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    UDP listening (F1 25):
                  </strong>{" "}
                  binds to a local UDP port (default 20776) to receive telemetry
                  packets broadcast by the game on your machine or local network
                  segment.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Filesystem monitoring:
                  </strong>{" "}
                  watches designated simulator telemetry directories for new or
                  updated files (for example iRacing{" "}
                  <code className={codeClassName}>.ibt</code> or Le Mans
                  Ultimate <code className={codeClassName}>.duckdb</code>
                  exports) and reads them in read-only or parse-only mode.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Configuration writes (iRacing):
                  </strong>{" "}
                  may write telemetry-enable flags to your local iRacing{" "}
                  <code className={codeClassName}>app.ini</code> to facilitate
                  disk telemetry capture.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Network transmission:
                  </strong>{" "}
                  sends parsed session JSON to {COMPANY_NAME} servers over HTTPS
                  when you are signed in with your account credentials and
                  entitled to upload. Raw simulator files are not uploaded.
                  Uploads are authenticated with your user JWT and server
                  session token (see our{" "}
                  <Link to="/privacy-policy" className={linkClassName}>
                    Privacy Policy
                  </Link>
                  ).
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Local persistence:
                  </strong>{" "}
                  stores your access JWT, server session token, a randomly
                  generated installation UUID (
                  <code className={codeClassName}>X-Apex-Device-Id</code>), and
                  cached Pro-gating state in the Agent’s application data
                  directory.
                </li>
              </ul>
              <p className={bodyClassName}>
                The Agent does not transmit your computer hostname, hardware
                serial numbers, MAC addresses, or keystrokes. Detailed data
                categories are described in our{" "}
                <Link to="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>4. Restrictions</h2>
              <p className={bodyClassName}>You must not:</p>
              <ul className={listClassName}>
                <li>
                  Copy, modify, adapt, translate, or create derivative works of
                  the Agent except as permitted by applicable law;
                </li>
                <li>
                  Reverse engineer, decompile, disassemble, or attempt to derive
                  source code from the Agent, except where such restriction is
                  prohibited by mandatory law;
                </li>
                <li>
                  Remove, alter, or obscure proprietary notices, labels, or
                  digital rights management;
                </li>
                <li>
                  Rent, lease, lend, sell, sublicense, or distribute the Agent
                  to third parties;
                </li>
                <li>
                  Use the Agent to intercept, collect, or transmit data you are
                  not authorised to access;
                </li>
                <li>
                  Circumvent Pro-tier upload restrictions, authentication, or
                  rate limits;
                </li>
                <li>
                  Use the Agent in any manner that violates simulator licence
                  agreements, anti-cheat policies, or applicable law.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>5. Pro subscription requirement</h2>
              <p className={bodyClassName}>
                Automated session uploads via the Agent require an active,
                non-delinquent Pro subscription as determined by our
                RevenueCat/Stripe billing integration. If your subscription
                expires or payment fails, upload functionality may be disabled
                and the Agent may cache a local “Pro required” state. Continued
                use of the Agent for local monitoring without upload may be
                permitted at our discretion, but upload features remain subject
                to current entitlement.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>6. Updates and support</h2>
              <p className={bodyClassName}>
                We may provide updates, patches, or replacements for the Agent.
                Updates may install automatically or require manual download
                from{" "}
                <a href={SITE_ORIGIN} className={linkClassName}>
                  {SITE_ORIGIN.replace(/^https:\/\//, "")}
                </a>
                . We are not obligated to provide maintenance, support, or
                updates, but may do so at our discretion.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>7. Third-party software</h2>
              <p className={bodyClassName}>
                The Agent interacts with third-party simulator software and may
                include open-source components subject to their respective
                licences. Simulator trademarks and content belong to their
                owners. Your use of simulators remains governed by their terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>8. Disclaimer of warranties</h2>
              <p className={bodyClassName}>
                THE AGENT IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT
                WARRANTY OF ANY KIND. TO THE FULLEST EXTENT PERMITTED BY LAW, WE
                DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
                NON-INFRINGEMENT.
              </p>
              <p className={bodyClassName}>
                We do not warrant that the Agent will detect every session,
                parse every telemetry file without error, remain compatible with
                all simulator versions, operate without interruption, or meet
                your performance expectations. Simulator updates may break Agent
                functionality until we release a compatible version.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>9. Limitation of liability</h2>
              <p className={bodyClassName}>
                TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE SHALL NOT
                BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                OR PUNITIVE DAMAGES, OR FOR LOSS OF DATA, PROFITS, OR GOODWILL,
                ARISING FROM YOUR USE OF OR INABILITY TO USE THE AGENT, EVEN IF
                ADVISED OF THE POSSIBILITY.
              </p>
              <p className={bodyClassName}>
                Nothing in this EULA excludes or limits liability that cannot be
                excluded or limited under applicable law, including liability
                for death or personal injury caused by negligence or fraud.
                Subject to that, our total aggregate liability under this EULA
                is limited to £100 or the amount you paid for Pro subscription
                in the twelve months preceding the claim, whichever is greater.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>10. Termination</h2>
              <p className={bodyClassName}>
                This licence is effective until terminated. You may terminate by
                uninstalling the Agent and signing out. We may terminate or
                suspend your licence immediately if you breach this EULA or our
                Terms &amp; Conditions. Upon termination, you must cease use and
                uninstall the Agent. Sections that by nature should survive
                (restrictions, disclaimers, limitation of liability) will
                survive termination.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>11. Export compliance</h2>
              <p className={bodyClassName}>
                You represent that you are not located in a country subject to
                UK, US, or EU embargo and are not listed on any government
                prohibited-party list. You agree to comply with applicable
                export control laws.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>12. Governing law</h2>
              <p className={bodyClassName}>
                This EULA is governed by the laws of England and Wales. The
                courts of England and Wales have exclusive jurisdiction, subject
                to mandatory consumer rights in your country of residence.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>13. Contact</h2>
              <p className={bodyClassName}>
                Questions about this EULA:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClassName}>
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </section>

            <footer className="mt-10 border-t border-apex-outline-variant/15 pt-8">
              <p className="font-apex-body text-xs text-apex-on-surface-variant">
                See also{" "}
                <Link to="/terms-and-conditions" className={linkClassName}>
                  Terms &amp; Conditions
                </Link>
                ,{" "}
                <Link to="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>
                , and{" "}
                <Link to="/cookie-policy" className={linkClassName}>
                  Cookie &amp; Storage Policy
                </Link>
                .
              </p>
            </footer>
          </div>
        </article>
      </div>
    </>
  );
}
