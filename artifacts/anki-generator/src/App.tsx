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

import Dashboard from "@/pages/dashboard";
import Generate from "@/pages/generate";
import Decks from "@/pages/decks";
import DeckDetail from "@/pages/deck-detail";
import Practice from "@/pages/practice";
import History from "@/pages/history";
import QbankDetail from "@/pages/qbank-detail";
import PracticeQbank from "@/pages/practice-qbank";
import AdminFeedback from "@/pages/admin-feedback";
import AdminUsers from "@/pages/admin-users";
import NotFound from "@/pages/not-found";
import { StudyPlannerTab } from "@/pages/study-planner-tab";
import StudyDue from "@/pages/study-due";
import Pricing from "@/pages/pricing";

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: ONE_WEEK,
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, err) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        return failureCount < 2;
      },
      networkMode: "offlineFirst",
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

function AppRouter() {
  return (
    <Layout>
      <ErrorBoundary>
        <PageTransition>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/generate" component={Generate} />
            <Route path="/decks" component={Decks} />
            <Route path="/decks/:id" component={DeckDetail} />
            <Route path="/practice/:id" component={Practice} />
            <Route path="/history" component={History} />
            <Route path="/qbanks/:id" component={QbankDetail} />
            <Route path="/practice-qbank/:id" component={PracticeQbank} />
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
