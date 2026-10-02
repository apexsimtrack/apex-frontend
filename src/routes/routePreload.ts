/**
 * Route-chunk preload helpers for nav intent prefetch.
 * Keep import paths aligned with lazyPages.ts.
 */

import { getToken } from "@/auth/token";

export function preloadDashboard(): Promise<unknown> {
  return import(
    /* webpackChunkName: "home-dashboard" */ "@/pages/Dashboard"
  );
}

export function preloadPublicHome(): Promise<unknown> {
  return import(/* webpackChunkName: "home-public" */ "@/pages/PublicHome");
}

export function preloadLeaderboards(): Promise<unknown> {
  return import(/* webpackChunkName: "leaderboards" */ "@/pages/Leaderboards");
}

export function preloadChallenges(): Promise<unknown> {
  return import(/* webpackChunkName: "challenges" */ "@/pages/Challenges");
}

export function preloadChallengeDetail(): Promise<unknown> {
  return import(
    /* webpackChunkName: "challenge-detail" */ "@/pages/ChallengeDetail"
  );
}

export function preloadCommunity(): Promise<unknown> {
  return import(/* webpackChunkName: "community" */ "@/pages/Community");
}

export function preloadDiscussionDetail(): Promise<unknown> {
  return import(
    /* webpackChunkName: "discussion-detail" */ "@/pages/DiscussionDetail"
  );
}

export function preloadPricing(): Promise<unknown> {
  return import(/* webpackChunkName: "pricing" */ "@/pages/Pricing");
}

export function preloadSessions(): Promise<unknown> {
  return import(/* webpackChunkName: "sessions" */ "@/pages/Sessions");
}

export function preloadSessionDetail(): Promise<unknown> {
  return import(
    /* webpackChunkName: "session-detail" */ "@/pages/SessionDetail"
  );
}

export function preloadProfile(): Promise<unknown> {
  return import(/* webpackChunkName: "profile" */ "@/pages/Profile");
}

export function preloadAgent(): Promise<unknown> {
  return import(/* webpackChunkName: "agent" */ "@/pages/Agent");
}

export function preloadSettings(): Promise<unknown> {
  return import(/* webpackChunkName: "settings" */ "@/pages/Settings");
}

export function preloadPersonalBests(): Promise<unknown> {
  return import(
    /* webpackChunkName: "personal-bests" */ "@/pages/PersonalBests"
  );
}

/** Map primary nav paths → chunk preload. */
export const routeChunkPreloaders: Record<string, () => Promise<unknown>> = {
  "/": () => (getToken() ? preloadDashboard() : preloadPublicHome()),
  "/leaderboards": preloadLeaderboards,
  "/challenges": preloadChallenges,
  "/community": preloadCommunity,
  "/pricing": preloadPricing,
  "/sessions": preloadSessions,
  "/profile": preloadProfile,
  "/agent": preloadAgent,
  "/settings": preloadSettings,
  "/personal-bests": preloadPersonalBests,
};

export function preloadRouteChunk(pathname: string): void {
  const path = pathname.split("?")[0] || "/";
  const preload = routeChunkPreloaders[path];
  if (preload) void preload();
}
