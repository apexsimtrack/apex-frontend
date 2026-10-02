import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { useEffect, useState, lazy, Suspense, type ReactNode } from "react";
import { getToken } from "@/auth/token";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ScrollToTop from "./components/ScrollToTop";
import ProtectedRoute from "./auth/ProtectedRoute";
import GuestOnlyRoute from "./auth/GuestOnlyRoute";
import AdminRoute from "./auth/AdminRoute";
import WebOnlyRoute from "./auth/WebOnlyRoute";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import SessionDataCacheSync from "./components/SessionDataCacheSync";
import ImpersonationBanner from "./components/ImpersonationBanner";
import AppLoadingScreen from "./components/AppLoadingScreen";
import ProductAppLayout from "./components/ProductAppLayout";
import NativeDeepLinkListener from "./components/NativeDeepLinkListener";
import NativeBillingIdentitySync from "./components/NativeBillingIdentitySync";
import HomeRoute from "./pages/HomeRoute";
import {
  prefetchAuthenticatedHomeData,
  prefetchHomePageChunk,
} from "./lib/prefetchHome";
import NotFound from "./pages/NotFound";
import AppErrorBoundaryFallback from "./components/AppErrorBoundaryFallback";
import { isGuestAuthPath } from "./auth/guestAuthRoutes";
import {
  AdminDashboard,
  AdminUsers,
  AdminSubscriptions,
  AdminUserDetail,
  AdminSessions,
  AdminSessionDetail,
  AdminTracks,
  AdminChallenges,
  AdminChallengeDetail,
  AdminContact,
  AdminContactDetail,
  AdminCommunity,
  AdminCommunityDiscussionDetail,
  AdminReports,
  AdminLeaderboards,
  AdminNotifications,
  AdminBroadcastDetail,
  AdminCampaignDetail,
  AdminFollows,
  AdminFollowUserDetail,
  AdminDevices,
  AdminEmailAuth,
  AdminSystem,
  Agent,
  Leaderboards,
  Challenges,
  Community,
  DiscussionDetail,
  Pricing,
  FAQ,
  About,
  MaintenanceNotice,
  Contact,
  TermsAndConditions,
  PrivacyPolicy,
  CookiePolicy,
  EULA,
  ChallengeDetail,
  Upload,
  ManualActivity,
  Sessions,
  EditActivity,
  SessionDetail,
  Settings,
  PersonalBests,
  Profile,
  UserProfile,
  Login,
  Signup,
  ForgotPassword,
  VerifyEmail,
} from "./routes/lazyPages";

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));

/** Primary user-facing shell (formerly AppRouteShell). */
function RedirectSingularSessionPath() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/sessions" replace />;
  return <Navigate to={`/sessions/${encodeURIComponent(id)}`} replace />;
}

function RedirectLegacyCommunityDiscussionPath() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/community" replace />;
  return <Navigate to={`/discussion/${encodeURIComponent(id)}`} replace />;
}

function AppShell({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const onGuestAuthPage = isGuestAuthPath(location.pathname);
  const isHomePath =
    location.pathname === "/" || location.pathname === "";
  const tokenPresent = Boolean(getToken());
  const [homeReady, setHomeReady] = useState(!isHomePath);
  const [booted, setBooted] = useState(false);

  // Overlap /me with Dashboard|PublicHome chunk + home queries (no serial splash→chunk→data).
  useEffect(() => {
    if (!isHomePath) {
      setHomeReady(true);
      return;
    }

    setHomeReady(false);
    let cancelled = false;
    const preferDashboard = Boolean(user) || (loading && tokenPresent);

    void prefetchHomePageChunk(preferDashboard).then(() => {
      if (!cancelled) setHomeReady(true);
    });

    // Only prefetch dashboard APIs after /me succeeds — stale tokens must not
    // fire home-weekly / activity/home before falling through to PublicHome.
    if (user) {
      prefetchAuthenticatedHomeData(queryClient, user);
    }

    return () => {
      cancelled = true;
    };
  }, [loading, user, isHomePath, queryClient, tokenPresent]);

  // Cold start only: auth must settle before paint when a token exists, so the
  // guest shell never flashes. Once the shell has painted, the splash is off the
  // table — tearing the whole tree down for an in-app navigation or a background
  // /me refetch unmounts the chrome and reads as a flicker. Route-level Suspense
  // covers everything after boot.
  const showSplash =
    !booted && !onGuestAuthPage && (loading || (isHomePath && !homeReady));

  useEffect(() => {
    if (!showSplash) setBooted(true);
  }, [showSplash]);

  if (showSplash) {
    return <AppLoadingScreen />;
  }

  return (
    <>
      <ScrollToTop />
      <ImpersonationBanner />
      <GlobalErrorBoundary
        fallback={AppErrorBoundaryFallback}
        resetKey={location.pathname}
      >
        {children}
      </GlobalErrorBoundary>
    </>
  );
}

/** Admin dashboard shell — no site Header/Footer; AdminLayout owns chrome. */
function AdminRouteShell({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen />;
  }

  return (
    <>
      <ScrollToTop />
      <ImpersonationBanner />
      <GlobalErrorBoundary resetKey="admin">{children}</GlobalErrorBoundary>
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SessionDataCacheSync />
          <NativeBillingIdentitySync />
          <Toaster theme="dark" />
          <BrowserRouter>
            <NativeDeepLinkListener />
            <Routes>
              <Route
                path="/admin"
                element={
                  <AdminRouteShell>
                    <AdminRoute message="Sign in to access the admin dashboard." />
                  </AdminRouteShell>
                }
              >
                <Route
                  element={
                    <Suspense fallback={<AppLoadingScreen />}>
                      <AdminLayout />
                    </Suspense>
                  }
                >
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route
                    path="subscriptions"
                    element={<AdminSubscriptions />}
                  />
                  <Route path="users/:userId" element={<AdminUserDetail />} />
                  <Route path="sessions" element={<AdminSessions />} />
                  <Route
                    path="sessions/:sessionId"
                    element={<AdminSessionDetail />}
                  />
                  <Route path="tracks" element={<AdminTracks />} />
                  <Route path="challenges" element={<AdminChallenges />} />
                  <Route
                    path="challenges/:challengeId"
                    element={<AdminChallengeDetail />}
                  />
                  <Route path="contact" element={<AdminContact />} />
                  <Route
                    path="contact/:contactId"
                    element={<AdminContactDetail />}
                  />
                  <Route path="community" element={<AdminCommunity />} />
                  <Route
                    path="community/:discussionId"
                    element={<AdminCommunityDiscussionDetail />}
                  />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="leaderboards" element={<AdminLeaderboards />} />
                  <Route
                    path="notifications"
                    element={<AdminNotifications />}
                  />
                  <Route
                    path="notifications/broadcasts/:broadcastId"
                    element={<AdminBroadcastDetail />}
                  />
                  <Route
                    path="notifications/campaigns/:campaignId"
                    element={<AdminCampaignDetail />}
                  />
                  <Route path="follows" element={<AdminFollows />} />
                  <Route
                    path="follows/users/:userId"
                    element={<AdminFollowUserDetail />}
                  />
                  <Route path="devices" element={<AdminDevices />} />
                  <Route path="email-auth" element={<AdminEmailAuth />} />
                  <Route path="system" element={<AdminSystem />} />
                </Route>
              </Route>
              <Route
                path="*"
                element={
                  <AppShell>
                    <Routes>
                      <Route element={<ProductAppLayout />}>
                        <Route index element={<HomeRoute />} />
                        <Route
                          path="home"
                          element={<Navigate to="/" replace />}
                        />
                        <Route
                          path="agent"
                          element={
                            <WebOnlyRoute>
                              <Agent />
                            </WebOnlyRoute>
                          }
                        />
                        <Route path="leaderboards" element={<Leaderboards />} />
                        <Route path="challenges" element={<Challenges />} />
                        <Route path="community" element={<Community />} />
                        <Route
                          path="discussion/:id"
                          element={<DiscussionDetail />}
                        />
                        {/* Legacy REPLY notification deep links */}
                        <Route
                          path="community/discussions/:id"
                          element={<RedirectLegacyCommunityDiscussionPath />}
                        />
                        <Route path="pricing" element={<Pricing />} />
                        <Route path="faq" element={<FAQ />} />
                        <Route path="about" element={<About />} />
                        <Route
                          path="status/maintenance/:maintenanceId"
                          element={<MaintenanceNotice />}
                        />
                        <Route path="contact" element={<Contact />} />
                        <Route
                          path="login"
                          element={
                            <GuestOnlyRoute redirectTo="/profile">
                              <Login />
                            </GuestOnlyRoute>
                          }
                        />
                        <Route
                          path="signup"
                          element={
                            <GuestOnlyRoute redirectTo="/profile">
                              <Signup />
                            </GuestOnlyRoute>
                          }
                        />
                        <Route
                          path="forgot-password"
                          element={
                            <GuestOnlyRoute redirectTo="/profile">
                              <ForgotPassword />
                            </GuestOnlyRoute>
                          }
                        />
                        <Route
                          path="verify-email"
                          element={
                            <GuestOnlyRoute redirectTo="/profile">
                              <VerifyEmail />
                            </GuestOnlyRoute>
                          }
                        />
                        <Route
                          path="terms-and-conditions"
                          element={<TermsAndConditions />}
                        />
                        <Route
                          path="privacy-policy"
                          element={<PrivacyPolicy />}
                        />
                        <Route
                          path="cookie-policy"
                          element={<CookiePolicy />}
                        />
                        <Route path="eula" element={<EULA />} />
                        <Route
                          path="challenge/:id"
                          element={<ChallengeDetail />}
                        />
                        <Route
                          path="upload"
                          element={
                            <ProtectedRoute message="Sign in to upload sessions.">
                              <Upload />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="manual"
                          element={
                            <ProtectedRoute message="Sign in to log a session.">
                              <ManualActivity />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="sessions"
                          element={
                            <ProtectedRoute message="Sign in to view your sessions.">
                              <Sessions />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="sessions/:id/edit"
                          element={
                            <ProtectedRoute message="Sign in to edit your session.">
                              <EditActivity />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="sessions/:id"
                          element={
                            <ProtectedRoute message="Sign in to view this session.">
                              <SessionDetail />
                            </ProtectedRoute>
                          }
                        />
                        {/* Legacy singular path from older notification deep links */}
                        <Route
                          path="session/:id"
                          element={<RedirectSingularSessionPath />}
                        />
                        <Route
                          path="settings"
                          element={
                            <ProtectedRoute message="Sign in to manage your account settings.">
                              <Settings />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="personal-bests"
                          element={
                            <ProtectedRoute message="Sign in to view your personal bests.">
                              <PersonalBests />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="profile"
                          element={
                            <ProtectedRoute message="Sign in to view your profile and stats.">
                              <Profile />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="user/:userId" element={<UserProfile />} />
                        <Route path="*" element={<NotFound />} />
                      </Route>
                    </Routes>
                  </AppShell>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
