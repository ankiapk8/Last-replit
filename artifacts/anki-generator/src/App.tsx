import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { ClickRipple } from "@/components/click-ripple";
import { OfflineBanner } from "@/components/offline-indicator";
import { UpdateBanner } from "@/components/update-banner";
import { WhatsNewBanner } from "@/components/whats-new-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { SplashScreen } from "@/components/splash-screen";
import { OfflineQueueProvider } from "@/providers/offline-queue-provider";
import { PwaInstallProvider } from "@/providers/pwa-install-provider";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { DevPanel } from "@/components/dev-panel";
import { Skeleton } from "@/components/ui/skeleton";

// Eager-loaded light routes
import Dashboard from "@/pages/dashboard";
import Generate from "@/pages/generate";
import Decks from "@/pages/decks";
import History from "@/pages/history";
import AdminFeedback from "@/pages/admin-feedback";
import AdminUsers from "@/pages/admin-users";
import NotFound from "@/pages/not-found";
import { StudyPlannerTab } from "@/pages/study-planner-tab";
import StudyDue from "@/pages/study-due";
import Pricing from "@/pages/pricing";

// Lazy-loaded heavy routes (code splitting)
const DeckDetail = lazy(() => import("@/pages/deck-detail"));
const Practice = lazy(() => import("@/pages/practice"));
const QbankDetail = lazy(() => import("@/pages/qbank-detail"));
const PracticeQbank = lazy(() => import("@/pages/practice-qbank"));

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: ONE_WEEK,
      staleTime: 1000 * 60 * 30,
      retry: (failureCount, err) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        return failureCount < 2;
      },
      networkMode: "offlineFirst",
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "ankigen-cache-v1",
  throttleTime: 1000,
});

function LazyRoute({
  component: Component,
  ...props
}: { component: React.ComponentType<any> } & any) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component {...props} />
    </Suspense>
  );
}

function AppRouter() {
  return (
    <Layout>
      <ErrorBoundary>
        <PageTransition>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/generate" component={Generate} />
            <Route path="/decks" component={Decks} />
            <Route path="/decks/:id" component={() => <LazyRoute component={DeckDetail} />} />
            <Route path="/practice/:id" component={() => <LazyRoute component={Practice} />} />
            <Route path="/history" component={History} />
            <Route path="/qbanks/:id" component={() => <LazyRoute component={QbankDetail} />} />
            <Route
              path="/practice-qbank/:id"
              component={() => <LazyRoute component={PracticeQbank} />}
            />
            <Route path="/planner" component={StudyPlannerTab} />
            <Route path="/study/due" component={StudyDue} />
            <Route path="/pricing" component={Pricing} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </ErrorBoundary>
    </Layout>
  );
}

function AppContent() {
  return (
    <PwaInstallProvider>
      <OfflineQueueProvider>
        <SplashScreen>
          <>
            <OfflineBanner />
            <UpdateBanner />
            <WhatsNewBanner />
            <AppRouter />
            <ClickRipple />
            <PwaInstallPrompt />
            {import.meta.env.DEV && <DevPanel />}
            <Toaster />
          </>
        </SplashScreen>
      </OfflineQueueProvider>
    </PwaInstallProvider>
  );
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_WEEK,
        buster: "v1",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => {
            const key = q.queryKey?.[0];
            if (typeof key !== "string") return false;
            return (
              key.includes("/decks") ||
              key.includes("/cards") ||
              key.includes("listDecks") ||
              key.includes("getDeck") ||
              key.includes("listDeckCards") ||
              key.includes("/qbanks") ||
              key.includes("listQbanks") ||
              key.includes("getQbank")
            );
          },
        },
      }}
    >
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/admin/feedback-9x7k" component={AdminFeedback} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route component={AppContent} />
          </Switch>
        </WouterRouter>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
