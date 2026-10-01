import type { ReactNode } from "react";
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

type StorageKeyRow = {
  keyNode: ReactNode;
  storage: string;
  purpose: ReactNode;
};

const strictlyNecessaryKeys: StorageKeyRow[] = [
  {
    keyNode: <code className={codeClassName}>apex_discussion_anon</code>,
    storage: "HttpOnly cookie",
    purpose:
      "Server-issued anonymous viewer ID for community discussion view deduplication (sent automatically on view API requests; not readable by page JavaScript)",
  },
  {
    keyNode: <code className={codeClassName}>apex_token</code>,
    storage: "localStorage",
    purpose: (
      <>
        JWT access token sent as{" "}
        <code className={codeClassName}>Authorization: Bearer</code>
      </>
    ),
  },
  {
    keyNode: <code className={codeClassName}>apex_session_token</code>,
    storage: "localStorage",
    purpose: (
      <>
        Server auth session ID sent as{" "}
        <code className={codeClassName}>X-Apex-Session</code>
      </>
    ),
  },
  {
    keyNode: <code className={codeClassName}>apex_refresh_token</code>,
    storage: "localStorage",
    purpose: "Optional refresh token for silent session renewal",
  },
  {
    keyNode: <code className={codeClassName}>apex_device_id</code>,
    storage: "localStorage",
    purpose: (
      <>
        Random UUID identifying this browser/installation; sent as{" "}
        <code className={codeClassName}>X-Apex-Device-Id</code>
      </>
    ),
  },
  {
    keyNode: <code className={codeClassName}>apex_verify_email</code>,
    storage: "sessionStorage",
    purpose: "Temporary email address during email verification flow",
  },
  {
    keyNode: (
      <>
        <code className={codeClassName}>apex_token_admin</code>,{" "}
        <code className={codeClassName}>apex_session_token_admin</code>,{" "}
        <code className={codeClassName}>apex_refresh_token_admin</code>
      </>
    ),
    storage: "localStorage",
    purpose:
      "Admin session backup during support impersonation (admin users only)",
  },
];

const functionalKeys: StorageKeyRow[] = [
  {
    keyNode: <code className={codeClassName}>apex_settings</code>,
    storage: "localStorage",
    purpose:
      "Cached notification and privacy preferences (synced with server when signed in)",
  },
  {
    keyNode: <code className={codeClassName}>apex_onboarded</code>,
    storage: "localStorage",
    purpose: "Whether first-visit Sessions page onboarding was dismissed",
  },
  {
    keyNode: <code className={codeClassName}>apex_admin_sidebar_collapsed</code>,
    storage: "localStorage",
    purpose: "Admin dashboard sidebar collapsed state",
  },
  {
    keyNode: <code className={codeClassName}>apex_discussion_anon_viewer</code>,
    storage: "localStorage",
    purpose:
      "Anonymous viewer ID for community discussion views (client-side; used for identity merge when signing in)",
  },
  {
    keyNode: <code className={codeClassName}>apex_discussion_viewed</code>,
    storage: "localStorage",
    purpose:
      "Capped list of discussion IDs already counted in this browser (avoids duplicate view requests on refresh)",
  },
];

function StorageKeyTable({ rows }: { rows: StorageKeyRow[] }) {
  return (
    <>
      {/* Mobile: stacked cards so long purposes stay readable instead of
          squishing into a 3-column table. */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row, index) => (
          <li
            key={index}
            className="rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-words">{row.keyNode}</span>
              <span className="shrink-0 rounded-apex-sm bg-apex-surface-container px-1.5 py-0.5 font-apex-body text-[10px] font-medium uppercase tracking-wide text-apex-on-surface-variant">
                {row.storage}
              </span>
            </div>
            <p className="mt-2 font-apex-body text-xs leading-relaxed text-apex-on-surface-variant">
              {row.purpose}
            </p>
          </li>
        ))}
      </ul>

      {/* Desktop: keep the compact table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left font-apex-body text-xs">
          <thead>
            <tr className="border-b border-apex-outline-variant/15">
              <th className="py-2 pr-4 font-apex-headline font-semibold text-apex-on-surface">
                Key
              </th>
              <th className="py-2 pr-4 font-apex-headline font-semibold text-apex-on-surface">
                Storage
              </th>
              <th className="py-2 font-apex-headline font-semibold text-apex-on-surface">
                Purpose
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-apex-outline-variant/10"
              >
                <td className="py-2 pr-4 align-top text-apex-on-surface-variant">
                  {row.keyNode}
                </td>
                <td className="whitespace-nowrap py-2 pr-4 align-top text-apex-on-surface-variant">
                  {row.storage}
                </td>
                <td className="py-2 align-top text-apex-on-surface-variant">
                  {row.purpose}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function CookiePolicy() {
  return (
    <>
      <PageMeta
        title={STATIC_SEO.cookies.title}
        description={STATIC_SEO.cookies.description}
        path={STATIC_SEO.cookies.path}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <article className="mx-auto w-full max-w-3xl">
          <header className="mb-10 border-b border-apex-outline-variant/15 pb-8">
            <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
              Cookie &amp; Storage Policy
            </h1>
            <p className="mt-2 font-apex-body text-sm text-apex-on-surface-variant">
              Last updated: 26 June 2026
            </p>
          </header>

          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className={h2ClassName}>1. Introduction</h2>
              <p className={bodyClassName}>
                This Cookie &amp; Storage Policy explains how {COMPANY_NAME}{" "}
                (“we”, “us”, “our”) uses cookies, browser local storage, session
                storage, and similar technologies when you use our website and
                web application at{" "}
                <a href={SITE_ORIGIN} className={linkClassName}>
                  {SITE_ORIGIN.replace(/^https:\/\//, "")}
                </a>
                , including when accessed via our Capacitor mobile shell. It
                should be read with our{" "}
                <Link to="/privacy-policy" className={linkClassName}>
                  Privacy Policy
                </Link>
                .
              </p>
              <p className={bodyClassName}>
                <strong className="text-apex-on-surface">
                  Current implementation note:
                </strong>{" "}
                authentication and preferences use browser storage APIs and HTTP
                authorization headers. We set one first-party HttpOnly cookie (
                <code className={codeClassName}>apex_discussion_anon</code>) to
                bind anonymous community discussion view counts to your browser.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>2. What we use instead of cookies</h2>
              <p className={bodyClassName}>
                The Service uses{" "}
                <strong className="text-apex-on-surface">local storage</strong>{" "}
                and{" "}
                <strong className="text-apex-on-surface">session storage</strong>{" "}
                in your browser (or Capacitor WebView) to persist authentication
                tokens, preferences, and lightweight UI state. These
                technologies are functionally similar to cookies in that data
                persists on your device, but they are not transmitted
                automatically with every HTTP request unless our JavaScript
                reads them and attaches values to API calls.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>3. Storage keys we use</h2>

              <h3 className={h3ClassName}>
                3.1 Strictly necessary (authentication and security)
              </h3>
              <StorageKeyTable rows={strictlyNecessaryKeys} />

              <h3 className={h3ClassName}>
                3.2 Functional (preferences and UI state)
              </h3>
              <StorageKeyTable rows={functionalKeys} />

              <h3 className={h3ClassName}>3.3 Theme preference</h3>
              <p className={bodyClassName}>
                The Service currently uses a fixed dark theme applied on load.
                We do not persist a theme toggle in local storage at this time.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>4. Capacitor mobile app</h2>
              <p className={bodyClassName}>
                Our iOS and Android builds use a Capacitor WebView that shares
                the same local storage keys as the web application. We do not
                use Capacitor Preferences or native secure storage plugins for
                authentication at this time. Signing out clears authentication
                keys from WebView storage.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>5. Apex Agent desktop storage</h2>
              <p className={bodyClassName}>
                The Apex Agent (documented in our{" "}
                <Link to="/eula" className={linkClassName}>
                  EULA
                </Link>
                ) stores data in your operating system’s application data
                directory, not in browser storage:
              </p>
              <ul className={listClassName}>
                <li>
                  <code className={codeClassName}>token.json</code> — access
                  JWT, optional refresh token, and server session token (
                  <code className={codeClassName}>X-Apex-Session</code>);
                </li>
                <li>
                  <code className={codeClassName}>
                    apex_client_device_id.txt
                  </code>{" "}
                  — installation UUID sent as{" "}
                  <code className={codeClassName}>X-Apex-Device-Id</code>;
                </li>
                <li>
                  <code className={codeClassName}>pro_state.json</code> — cached
                  Pro entitlement requirement state.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>6. Third-party cookies</h2>
              <p className={bodyClassName}>
                When you complete a Pro subscription checkout or open the
                billing portal, RevenueCat and Stripe may set their own cookies
                or use storage on their domains. We do not control those
                technologies; refer to{" "}
                <a
                  href="https://www.revenuecat.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClassName}
                >
                  RevenueCat’s privacy notice
                </a>{" "}
                and{" "}
                <a
                  href="https://stripe.com/gb/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClassName}
                >
                  Stripe’s privacy notice
                </a>
                .
              </p>
              <p className={bodyClassName}>
                We do not currently integrate Google Analytics or similar
                third-party analytics cookies in the web application codebase.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>7. Legal basis (UK GDPR / PECR)</h2>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">
                    Strictly necessary storage:
                  </strong>{" "}
                  required to provide the Service you request (authentication,
                  security, verification flows) — legitimate interests and/or
                  contract.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Functional storage:
                  </strong>{" "}
                  preferences and UI state — legitimate interests; where consent
                  is required under PECR for non-essential storage, we will
                  obtain it before use.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>8. How to control storage</h2>
              <ul className={listClassName}>
                <li>
                  <strong className="text-apex-on-surface">Sign out:</strong>{" "}
                  removes authentication tokens from local storage via the app’s
                  sign-out flow.
                </li>
                <li>
                  <strong className="text-apex-on-surface">
                    Browser settings:
                  </strong>{" "}
                  you can clear local storage and session storage through your
                  browser or device settings. Clearing auth keys will sign you
                  out and may reset UI preferences.
                </li>
                <li>
                  <strong className="text-apex-on-surface">Agent:</strong> sign
                  out from the Agent tray menu or delete the Agent’s application
                  data folder to remove locally stored tokens.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>9. Changes</h2>
              <p className={bodyClassName}>
                We may update this policy when we add new storage keys,
                introduce cookies, or change third-party integrations. We will
                update the “Last updated” date and, where required, seek consent
                for new non-essential technologies.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className={h2ClassName}>10. Contact</h2>
              <p className={bodyClassName}>
                Questions:{" "}
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
                <Link to="/terms-and-conditions" className={linkClassName}>
                  Terms &amp; Conditions
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
