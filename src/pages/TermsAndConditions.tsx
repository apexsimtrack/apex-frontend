import { Link } from "react-router-dom";
import PageMeta from "@/components/PageMeta";
import { STATIC_SEO } from "@/config/seoMeta";
import { COMPANY_NAME, SITE_ORIGIN } from "@/lib/siteMeta";
import { SUPPORT_EMAIL } from "@/lib/appConfig";

const linkClassName =
  "text-apex-primary transition-colors hover:text-apex-primary/80";

export default function TermsAndConditions() {
  return (
    <>
      <PageMeta
        title={STATIC_SEO.terms.title}
        description={STATIC_SEO.terms.description}
        path={STATIC_SEO.terms.path}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <article className="mx-auto w-full max-w-3xl">
          <header className="mb-10 border-b border-apex-outline-variant/15 pb-8">
            <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
              Terms &amp; Conditions
            </h1>
            <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
              Last updated: 26 June 2026
            </p>
          </header>

          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                1. Agreement
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                These Terms &amp; Conditions (“Terms”) govern your access to and
                use of the website, web application, Capacitor mobile app, and
                Apex Agent desktop software operated by {COMPANY_NAME} (“we”,
                “us”, “our”) at{" "}
                <a href={SITE_ORIGIN} className={linkClassName}>
                  {SITE_ORIGIN.replace(/^https:\/\//, "")}
                </a>{" "}
                (together, the “Service”). By accessing or using the Service,
                you agree to these Terms. If you do not agree, do not use the
                Service.
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Use of the Apex Agent desktop application is also subject to our{" "}
                <Link to="/eula" className={linkClassName}>
                  End User License Agreement (EULA)
                </Link>
                . Our{" "}
                <Link to="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>{" "}
                describes how we process personal data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                2. Who we are
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                The Service is provided by {COMPANY_NAME}. For questions about
                these Terms, contact us at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClassName}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                3. The Service
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                {COMPANY_NAME} provides online tools for sim racing session
                tracking, telemetry analysis, community features, challenges,
                leaderboards, and related functionality. The Apex Agent is an
                optional desktop background application that monitors supported
                simulators locally and uploads session summaries to your account
                when configured and authorised.
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                We may modify, suspend, or discontinue any part of the Service
                with reasonable notice where practicable. Feature availability
                may depend on your subscription tier (see section 8).
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                4. Accounts and eligibility
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You must provide accurate registration information and keep your
                credentials secure. You are responsible for all activity under
                your account, including activity performed through the Apex
                Agent when signed in with your credentials. You must be at least
                13 years old to use the Service, or the minimum age required in
                your country if higher.
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You may link the Apex Agent to your account by signing in with
                your {COMPANY_NAME} credentials in the Agent. You are
                responsible for ensuring the Agent runs only on devices you
                control and that you sign out or uninstall the Agent when you no
                longer wish it to upload data on your behalf.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                5. Acceptable use
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You agree not to:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                <li>
                  Violate applicable law or third-party rights (including game
                  publisher terms of use);
                </li>
                <li>
                  Upload malware, probe or test vulnerabilities, or interfere
                  with the Service or its users;
                </li>
                <li>
                  Scrape, data-mine, or use automated means to access the
                  Service except as we expressly permit (including via the
                  documented Apex Agent upload API when authenticated);
                </li>
                <li>
                  Harass, abuse, or post unlawful, defamatory, or infringing
                  content;
                </li>
                <li>
                  Attempt to gain unauthorised access to accounts, systems, or
                  data;
                </li>
                <li>
                  Submit falsified, manipulated, or third-party telemetry data
                  as your own performance records;
                </li>
                <li>
                  Circumvent subscription checks, Pro-tier gates, rate limits,
                  or other access controls.
                </li>
              </ul>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                We may suspend or terminate access for breach of these Terms or
                where necessary to protect the Service.
              </p>

              <h3 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                5.1 Automated telemetry infrastructure
              </h3>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                When you install and run the Apex Agent, you authorise it to:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                <li>
                  Listen on local network interfaces for supported simulator
                  telemetry (for example F1 25 UDP on port 20776);
                </li>
                <li>
                  Read simulator-generated telemetry files from designated
                  folders on your device (for example iRacing{" "}
                  <code className="rounded-apex-sm bg-apex-surface-container px-1 py-0.5 font-mono text-xs text-apex-on-surface">
                    .ibt
                  </code>{" "}
                  files or Le Mans Ultimate{" "}
                  <code className="rounded-apex-sm bg-apex-surface-container px-1 py-0.5 font-mono text-xs text-apex-on-surface">
                    .duckdb
                  </code>{" "}
                  exports);
                </li>
                <li>
                  Parse, normalise, and transmit session summaries to our
                  servers over HTTPS when you are authenticated and entitled to
                  use upload features;
                </li>
                <li>
                  Store your access JWT, server session token, and a randomly
                  generated installation identifier locally in the Agent’s
                  application data directory.
                </li>
              </ul>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You must not use the Agent or any modified version to intercept
                telemetry you are not authorised to collect, interfere with
                other users’ systems, or exfiltrate data beyond the scope of the
                Service. You are responsible for compliance with your
                simulator’s licence terms and any applicable anti-cheat or
                telemetry policies.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                6. User content
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You retain rights in content you submit, including session data,
                telemetry, posts, and comments. You grant us a worldwide,
                non-exclusive licence to host, store, reproduce, process,
                analyse, and display your content solely to operate and improve
                the Service (including telemetry charts, personal bests,
                leaderboards, and community features). You represent that you
                have the rights needed to grant this licence and that your
                content does not violate third-party rights.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                7. Intellectual property
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                The Service, including software, branding, and design, is owned
                by {COMPANY_NAME} or its licensors. Simulator names, tracks, and
                car data displayed in the Service may be trademarks of their
                respective owners. Except as expressly allowed, you may not
                copy, modify, distribute, reverse engineer, or create derivative
                works from our materials. Additional restrictions on the Apex
                Agent are set out in the{" "}
                <Link to="/eula" className={linkClassName}>
                  EULA
                </Link>
                .
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                8. Subscriptions, Pro tier, and billing
              </h2>

              <h3 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                8.1 Free and Pro tiers
              </h3>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                The Service offers free and paid (“Pro”) tiers. Free-tier
                features may include limited session history visibility
                (sessions older than 90 days may be inaccessible in the UI),
                restricted telemetry analysis, and manual upload rate limits.
                Pro-tier features may include automated Agent uploads, extended
                session history access, advanced telemetry charts, and other
                capabilities we designate as Pro-only.
              </p>

              <h3 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                8.2 Subscription status and feature locks
              </h3>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                <strong className="text-apex-on-surface">
                  Pro-tier and system feature locks are governed exclusively by
                  your current, valid subscription entitlement as evaluated by
                  our billing infrastructure.
                </strong>{" "}
                We determine entitlement by synchronising subscription state
                from RevenueCat (our subscription management provider), which in
                turn reflects payment status processed by Stripe. An active,
                non-delinquent Pro subscription is required for Pro-gated
                features including, without limitation, Apex Agent session
                uploads and certain telemetry analysis endpoints.
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                If your subscription lapses, is cancelled, enters a grace
                period, or becomes delinquent, Pro features may be disabled
                immediately or after any applicable grace period communicated at
                checkout. We are not liable for loss of access to Pro features
                resulting from expired or unpaid subscriptions. You may restore
                access by renewing or updating your payment method through the
                billing portal provided in Settings or on the Pricing page.
              </p>

              <h3 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                8.3 Billing terms
              </h3>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Paid subscriptions are processed through RevenueCat and Stripe.
                By subscribing, you agree to RevenueCat’s and Stripe’s
                applicable terms for checkout and payment. Prices, billing
                intervals, and trial offers are displayed at purchase.
                Separately, each newly verified account receives 10 days of
                complimentary Pro access without payment details. We may also
                grant invited beta users a separate, administrator-managed
                complimentary access period. Neither is a Stripe/RevenueCat
                promotional checkout. Starting a paid Pro subscription ends
                active complimentary access. Subscriptions renew automatically
                unless cancelled before the renewal date through the billing
                self-service portal or as otherwise described at checkout.
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Refund eligibility is determined by applicable consumer law and
                the policies of our payment processors. Contact{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClassName}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                for billing support.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                9. Third-party services
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                The Service integrates with third-party services including
                RevenueCat, Stripe, Cloudflare, email providers, and simulator
                software. Those services are governed by their own terms and
                privacy notices. We are not responsible for third-party content,
                simulator availability, or third-party practices beyond our
                reasonable selection and contractual requirements of
                sub-processors.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                10. Disclaimers
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                The Service is provided on an “as is” and “as available” basis.
                To the fullest extent permitted by law, we disclaim all
                warranties, whether express, implied, or statutory, including
                merchantability, fitness for a particular purpose, and
                non-infringement. We do not warrant uninterrupted or error-free
                operation, accurate lap timing relative to official race
                control, or compatibility with every simulator version or
                hardware configuration.
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Telemetry data displayed in the Service is derived from
                simulator output and may contain errors, omissions, or delays.
                Do not rely on the Service for safety-critical or commercial
                timing decisions.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                11. Limitation of liability
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Nothing in these Terms excludes or limits liability that cannot
                be excluded or limited under applicable law, including liability
                for death or personal injury caused by negligence or fraud.
                Subject to that, to the fullest extent permitted by law, we are
                not liable for any indirect, incidental, special, consequential,
                or punitive damages, or for loss of profits, data, or goodwill.
                Our total liability for any claim arising out of or relating to
                the Service is limited to the greater of £100 or the amounts you
                paid us for the Service in the twelve months before the claim
                (if any).
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                12. Indemnity
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You will defend and indemnify {COMPANY_NAME} and its directors,
                officers, and employees against claims, damages, losses, and
                expenses (including reasonable legal fees) arising from your use
                of the Service, your content, your operation of the Apex Agent,
                or your breach of these Terms, to the extent permitted by law.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                13. Termination
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                You may stop using the Service at any time and delete your
                account in Settings. We may suspend or terminate your access for
                breach of these Terms, non-payment, or to protect the Service.
                On termination, your right to use the Service ceases; provisions
                that by their nature should survive (including intellectual
                property, disclaimers, limitation of liability, and indemnity)
                will survive.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                14. Changes
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                We may update these Terms by posting a revised version on this
                page and updating the “Last updated” date. Continued use after
                changes constitutes acceptance of the revised Terms where
                permitted by law. Material changes may be communicated by email
                or in-app notice where appropriate.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                15. Governing law and jurisdiction
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                These Terms are governed by the laws of England and Wales. The
                courts of England and Wales have exclusive jurisdiction to
                resolve disputes arising from or relating to these Terms or the
                Service, subject to any mandatory rights you may have as a
                consumer in your country of residence.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
                16. Contact
              </h2>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Questions about these Terms:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClassName}>
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </section>

            <footer className="mt-10 border-t border-apex-outline-variant/15 pt-8">
              <p className="font-apex-body text-xs text-apex-on-surface-variant">
                See also{" "}
                <Link to="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>
                ,{" "}
                <Link to="/cookie-policy" className={linkClassName}>
                  Cookie &amp; Storage Policy
                </Link>
                , and{" "}
                <Link to="/eula" className={linkClassName}>
                  EULA
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
