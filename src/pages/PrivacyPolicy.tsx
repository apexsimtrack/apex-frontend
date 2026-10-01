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

const h3ClassName = "font-apex-headline text-sm font-semibold text-apex-on-surface";

export default function PrivacyPolicy() {
  return (
    <>
      <PageMeta
        title={STATIC_SEO.privacy.title}
        description={STATIC_SEO.privacy.description}
        path={STATIC_SEO.privacy.path}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <article className="mx-auto w-full max-w-3xl">
          <header className="mb-10 border-b border-apex-outline-variant/15 pb-8">
            <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
              Privacy Policy
            </h1>
            <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
              Last updated: 26 June 2026
            </p>
          </header>

          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className={h2ClassName}>1. Introduction</h2>
              <p className={bodyClassName}>
                This Privacy Policy explains how {COMPANY_NAME} (“we”, “us”,
                “our”) processes personal data when you use our website, web
                application, Capacitor mobile app, and Apex Agent desktop
                software (together, the “Service”) at{" "}
                <a href={SITE_ORIGIN} className={linkClassName}>
                  {SITE_ORIGIN.replace(/^https:\/\//, "")}
                </a>
                . We process personal data in accordance with the UK General
                Data Protection Regulation (UK GDPR), the Data Protection Act
                2018, and related UK privacy laws.
              </p>
              <p className={bodyClassName}>
                This policy should be read together with our{" "}
                <Link to="/cookie-policy" className={linkClassName}>
                  Cookie &amp; Storage Policy
                </Link>
                ,{" "}
                <Link to="/terms-and-conditions" className={linkClassName}>
                  Terms &amp; Conditions
                </Link>
                , and (for the desktop Agent) our{" "}
                <Link to="/eula" className={linkClassName}>
                  End User License Agreement
                </Link>
                .
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>2. Data controller</h2>
              <p className={bodyClassName}>
                {COMPANY_NAME} is the data controller for personal data
                described in this policy. For privacy enquiries or to exercise
                your rights, contact:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClassName}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>3. Personal data we collect</h2>
              <p className={bodyClassName}>
                Depending on how you use the Service, we may process the
                following categories of data:
              </p>

              <h3 className={h3ClassName}>3.1 Account and profile data</h3>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">Registration:</strong>{" "}
                  email address, password (stored as a salted hash; we never
                  store plain-text passwords), and optional display name.
                </li>
                <li>
                  <strong className="text-apex-on-surface">Profile:</strong> name,
                  biography, profile avatar (stored in Cloudflare R2 object
                  storage), and privacy preferences (for example private
                  profile, session visibility, follow approval settings).
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Email verification and password reset:
                  </strong>{" "}
                  hashed one-time codes linked to your email address for
                  authentication flows.
                </li>
              </ul>

              <h3 className={h3ClassName}>
                3.2 Authentication and security data
              </h3>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    Session tokens:
                  </strong>{" "}
                  JWT access tokens, opaque server session identifiers sent as{" "}
                  <code className={codeClassName}>X-Apex-Session</code>, and
                  optional refresh tokens (persisted in browser local storage on
                  web/mobile, or in the Agent’s local application data directory
                  on desktop).
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Installation identifier:
                  </strong>{" "}
                  a randomly generated UUID created on first use of a browser or
                  Agent installation, sent as{" "}
                  <code className={codeClassName}>X-Apex-Device-Id</code> to
                  associate login sessions and agent uploads with an
                  installation (not hardware identifiers).
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Auth session records:
                  </strong>{" "}
                  when you sign in or verify your email, we store your user
                  agent string, first and last seen IP addresses, approximate
                  geographic location derived from IP (country, region, city,
                  latitude/longitude via GeoLite lookup), and a risk score used
                  for fraud prevention.
                </li>
              </ul>

              <h3 className={h3ClassName}>
                3.3 Sim racing session and telemetry data
              </h3>
              <p className={bodyClassName}>
                When you upload sessions manually, via the web uploader, or
                through the Apex Agent desktop application, we collect
                structured session summaries and, where available, downsampled
                per-lap telemetry traces. This may include:
              </p>
              <ul className={listClassName}>
                <li>
                  Track and car identifiers, session type (practice, qualifying,
                  race, etc.), lap times, sector splits, finishing or qualifying
                  positions, and session timestamps.
                </li>
                <li>
                  Per-lap telemetry traces (downsampled to approximately 600
                  data points per lap): distance, speed, brake, throttle, gear,
                  and optionally steering, fuel levels, tyre temperatures, and
                  tyre wear.
                </li>
                <li>
                  Session metadata such as air/track temperature, humidity, fuel
                  tank capacity, and game-specific session identifiers used for
                  deduplication.
                </li>
                <li>
                  Driver or vehicle names as reported by the simulation software
                  (for example from iRacing session YAML or F1 game participant
                  data).
                </li>
                <li>
                  Notes, likes, and comments you attach to sessions, plus
                  personal best records derived from your lap data.
                </li>
              </ul>
              <p className={bodyClassName}>
                <strong className="text-apex-on-surface">Important:</strong> the
                Apex Agent reads telemetry locally from supported simulators (F1
                25 via UDP on port 20776, iRacing{" "}
                <code className={codeClassName}>.ibt</code> files, and Le Mans
                Ultimate <code className={codeClassName}>.duckdb</code>{" "}
                exports). Raw simulator files are not uploaded; only parsed,
                normalized JSON summaries are transmitted to our servers over
                HTTPS. See section 4 for collection mechanisms.
              </p>

              <h3 className={h3ClassName}>3.4 Community and social data</h3>
              <ul className={listClassName}>
                <li>
                  Discussion posts and comments, follow relationships,
                  notifications, and challenge leaderboard entries.
                </li>
                <li>
                  Anonymous viewer identifiers stored in browser local storage
                  when you view community discussions without signing in.
                </li>
              </ul>

              <h3 className={h3ClassName}>3.5 Billing and subscription data</h3>
              <ul className={listClassName}>
                <li>
                  Your Apex user ID is shared with RevenueCat as the
                  subscription{" "}
                  <code className={codeClassName}>app_user_id</code>. We may
                  also pass your email address to RevenueCat as a subscriber
                  attribute for receipt and account management purposes.
                </li>
                <li>
                  We cache subscription status, entitlement identifiers, billing
                  period timestamps, and Stripe customer ID (when provided by
                  RevenueCat) in our database. Payment card details are
                  processed directly by Stripe via RevenueCat Web Billing; we do
                  not store card numbers.
                </li>
              </ul>

              <h3 className={h3ClassName}>3.6 Contact and support data</h3>
              <ul className={listClassName}>
                <li>
                  When you submit our contact form: your name, email address,
                  message content, IP address, and an internal request
                  identifier. If you are signed in, we may also link the
                  submission to your user account.
                </li>
              </ul>

              <h3 className={h3ClassName}>
                3.7 Agent download and operational logs
              </h3>
              <ul className={listClassName}>
                <li>
                  When you download the Apex Agent installer: your user ID,
                  operating system, Agent version, request identifier, and
                  download outcome.
                </li>
                <li>
                  Aggregated admin audit logs and moderation records where
                  applicable.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>4. How data is collected</h2>

              <h3 className={h3ClassName}>4.1 Web and mobile application</h3>
              <p className={bodyClassName}>
                Data is collected when you register, sign in, update your
                profile or settings, upload session files, participate in
                community features, subscribe to Pro, or contact us.
                Authentication state is maintained via tokens stored in browser
                local storage (see our{" "}
                <Link to="/cookie-policy" className={linkClassName}>
                  Cookie &amp; Storage Policy
                </Link>
                ).
              </p>

              <h3 className={h3ClassName}>
                4.2 Apex Agent desktop application
              </h3>
              <p className={bodyClassName}>
                The Apex Agent is a background application for Windows, macOS,
                and Linux that monitors local simulator telemetry and uploads
                session summaries to our API when you are signed in with an
                active Pro subscription. Collection mechanisms include:
              </p>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">F1 25 (UDP):</strong>{" "}
                  listens on local UDP port 20776 (configurable) for game
                  telemetry packets including lap times, sector splits, car
                  telemetry (speed, throttle, brake, gear), fuel levels, tyre
                  temperatures, and session classification data. UDP traffic
                  remains on your local machine; only finalized session JSON is
                  uploaded.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    iRacing (file watch):
                  </strong>{" "}
                  monitors your iRacing telemetry folder for new{" "}
                  <code className={codeClassName}>.ibt</code> files, parses them
                  locally, and uploads session summaries after the simulator
                  exits. The Agent may write telemetry-enable flags to your
                  local iRacing configuration; it does not modify telemetry
                  files themselves.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Le Mans Ultimate (file watch):
                  </strong>{" "}
                  reads <code className={codeClassName}>.duckdb</code> telemetry
                  exports from your LMU user data folder in read-only mode and
                  uploads lap-time summaries (without full driving traces).
                </li>
              </ul>
              <p className={bodyClassName}>
                Uploads are sent via HTTPS to{" "}
                <code className={codeClassName}>POST /laps/upload</code> as
                multipart JSON, authenticated with your bearer JWT,{" "}
                <code className={codeClassName}>X-Apex-Session</code> server
                session token, and{" "}
                <code className={codeClassName}>X-Apex-Device-Id</code>{" "}
                installation identifier.
              </p>

              <h3 className={h3ClassName}>4.3 Third-party integrations</h3>
              <p className={bodyClassName}>
                Billing events are received via RevenueCat webhooks. Email is
                sent through our transactional email provider. IP geolocation
                uses a local GeoLite database lookup at login time.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>5. How we use your data</h2>
              <ul className={listClassName}>
                <li>Provide, authenticate, and secure the Service;</li>
                <li>
                  Store, analyse, and display your sim racing sessions,
                  telemetry charts, and personal bests;
                </li>
                <li>
                  Operate community features, challenges, leaderboards, and
                  notifications;
                </li>
                <li>
                  Process subscriptions, enforce Pro-tier feature access, and
                  manage billing self-service;
                </li>
                <li>
                  Send transactional emails (verification, password reset,
                  service notices);
                </li>
                <li>Detect fraud, abuse, and security incidents;</li>
                <li>Comply with legal obligations and enforce our terms.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>6. Legal bases (UK GDPR)</h2>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    Contract (Article 6(1)(b)):
                  </strong>{" "}
                  processing necessary to provide the Service you request,
                  including account management, session storage, Agent uploads,
                  and subscription fulfilment.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Legitimate interests (Article 6(1)(f)):
                  </strong>{" "}
                  security monitoring (IP/geo on login), fraud prevention,
                  service improvement, deduplication of Agent uploads, and
                  internal analytics, balanced against your rights.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Consent (Article 6(1)(a)):
                  </strong>{" "}
                  where required for optional processing (for example
                  non-essential storage technologies, if we introduce them with
                  consent requirements).
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Legal obligation (Article 6(1)(c)):
                  </strong>{" "}
                  where we must retain or disclose data to comply with
                  applicable law.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>7. Sub-processors and sharing</h2>
              <p className={bodyClassName}>
                We use the following categories of sub-processors who process
                personal data on our instructions. We require appropriate
                contractual safeguards.
              </p>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    Cloud hosting (PostgreSQL):
                  </strong>{" "}
                  primary database for all account, session, and community data.
                </li>
                <li>
                  <strong className="text-apex-on-surface">Cloudflare R2:</strong>{" "}
                  object storage for profile avatars (public URLs) and Apex
                  Agent installer binaries (private, served via time-limited
                  presigned URLs).
                </li>
                <li>
                  <strong className="text-apex-on-surface">RevenueCat:</strong>{" "}
                  subscription management; receives your Apex user ID and
                  optionally your email address.
                </li>
                <li>
                  <strong className="text-apex-on-surface">Stripe:</strong>{" "}
                  payment processing via RevenueCat Web Billing; receives
                  billing and payment data you provide at checkout. We access
                  Stripe only for customer portal sessions using your cached
                  Stripe customer ID.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Transactional email (Resend or SMTP):
                  </strong>{" "}
                  delivers verification and password-reset emails to your email
                  address.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Application hosting (for example Vercel, Render):
                  </strong>{" "}
                  serves the web frontend and API infrastructure.
                </li>
              </ul>
              <p className={bodyClassName}>
                We may also disclose information if required by law, to protect
                rights and safety, or in connection with a business transfer,
                subject to applicable law.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>8. International transfers</h2>
              <p className={bodyClassName}>
                Some sub-processors may process data outside the UK (including
                in the United States). Where we transfer personal data
                internationally, we implement appropriate safeguards such as the
                UK International Data Transfer Agreement / Addendum or reliance
                on adequacy regulations, as required by UK GDPR.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>9. Data retention</h2>
              <p className={bodyClassName}>
                We retain personal data only as long as necessary for the
                purposes described in this policy. The following retention
                periods reflect our current practices:
              </p>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    Active account data:
                  </strong>{" "}
                  retained while your account is active and for a reasonable
                  period thereafter to resolve disputes, enforce terms, or meet
                  legal obligations.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Authentication sessions:
                  </strong>{" "}
                  server-side auth sessions expire after approximately 30 days;
                  session records are deleted when you delete your account.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Email and password-reset codes:
                  </strong>{" "}
                  retained until expiry (typically short-lived) and then
                  eligible for deletion.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Session and telemetry data:
                  </strong>{" "}
                  retained while your account exists unless you delete specific
                  manual sessions or an administrator removes them. Free-tier
                  users cannot access sessions older than 90 days in the UI, but
                  the underlying data may remain stored until account deletion
                  or manual removal.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Billing records:
                  </strong>{" "}
                  subscription cache and RevenueCat/Stripe identifiers retained
                  while your account exists and as required for tax and
                  accounting purposes.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Contact submissions:
                  </strong>{" "}
                  retained for support and audit purposes unless deletion is
                  requested and permitted by law.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Profile avatars in R2:
                  </strong>{" "}
                  replaced when you upload a new avatar; may persist after
                  account deletion unless separately removed.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Agent local data:
                  </strong>{" "}
                  authentication tokens and installation UUID on your device
                  remain until you sign out, uninstall the Agent, or delete
                  local application data.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>10. Your rights</h2>
              <p className={bodyClassName}>
                Under UK data protection law you may have the right to:
              </p>
              <ul className={listClassName}>
                <li>Access your personal data;</li>
                <li>Rectify inaccurate data;</li>
                <li>Erase data in certain circumstances (right to erasure);</li>
                <li>
                  Restrict or object to processing in certain circumstances;
                </li>
                <li>Data portability where applicable;</li>
                <li>Withdraw consent where processing is based on consent;</li>
                <li>
                  Lodge a complaint with the UK Information Commissioner’s
                  Office (ICO) at{" "}
                  <a
                    href="https://ico.org.uk/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClassName}
                  >
                    ico.org.uk
                  </a>
                  .
                </li>
              </ul>

              <h3 className={h3ClassName}>
                10.1 How to exercise your rights in the Service
              </h3>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    Access and portability:
                  </strong>{" "}
                  in Settings, use “Export my data” to download an Excel (.xlsx)
                  or PDF summary of your account data. You may include full lap
                  telemetry traces in the export by selecting the telemetry
                  option.
                </li>
                <li>
                  <strong className="text-apex-on-surface">Rectification:</strong>{" "}
                  update your profile name, bio, avatar, and privacy settings in
                  Settings or on your Profile page.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Erasure (account deletion):
                  </strong>{" "}
                  in Settings, use “Delete account” and confirm with your
                  password. This performs a soft delete: your email, name, bio,
                  avatar reference, and password are anonymised; active auth
                  sessions are revoked. Certain data (for example uploaded
                  session telemetry, community posts, billing cache, and contact
                  records) may persist in anonymised or disassociated form. To
                  request fuller erasure, contact us at{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClassName}>
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Delete individual sessions:
                  </strong>{" "}
                  manual activity sessions you created can be deleted from the
                  session management UI. Agent-uploaded sessions can be removed
                  by contacting support or via admin processes where applicable.
                </li>
              </ul>
              <p className={bodyClassName}>
                We may need to verify your identity before fulfilling requests.
                We will respond within one month, extendable where permitted by
                law.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>11. Cookies and local storage</h2>
              <p className={bodyClassName}>
                We do not currently set first-party HTTP cookies for
                authentication. Instead, we use browser local storage and
                session storage for tokens, preferences, and UI state. Full
                details are in our{" "}
                <Link to="/cookie-policy" className={linkClassName}>
                  Cookie &amp; Storage Policy
                </Link>
                .
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>12. Security</h2>
              <p className={bodyClassName}>
                We implement appropriate technical and organisational measures
                including password hashing with a server-side pepper, hashed
                opaque session tokens, HTTPS transport, and access controls on
                telemetry and billing endpoints. No method of transmission or
                storage is completely secure; use a strong, unique password and
                keep your Agent installation secure.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>13. Children</h2>
              <p className={bodyClassName}>
                The Service is not directed at children under 13, and we do not
                knowingly collect personal data from children under 13. If you
                believe we have collected such data, contact us and we will take
                appropriate steps to delete it.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>14. Changes to this policy</h2>
              <p className={bodyClassName}>
                We may update this Privacy Policy from time to time. We will
                post the revised policy on this page and update the “Last
                updated” date. Where changes are material, we may provide
                additional notice by email or in-app.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>15. Contact</h2>
              <p className={bodyClassName}>
                For privacy enquiries:{" "}
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
