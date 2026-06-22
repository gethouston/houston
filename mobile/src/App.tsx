// Root. On boot:
//   1. Read any paired-engine record from localStorage.
//   2. If paired, initialise the HoustonClient + WS.
//   3. Route gate: unpaired → /pair; paired → / (missions).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { ChatView } from "./components/chat-view";
import { MissionControl } from "./components/mission-control";
import { OfflineBanner } from "./components/offline-banner";
import { PairScreen } from "./components/pair-screen";
import { useEngineInvalidation } from "./hooks/use-engine-invalidation";
import { initEngine, stopEngine, useEngineReady } from "./lib/engine";
import { clearPaired, loadPaired } from "./lib/storage";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <BootGate>
        <BrowserRouter>
          <div className="mx-auto h-full w-full max-w-[430px] bg-background">
            <OfflineBanner />
            <InvalidationPump />
            <Routes>
              <Route
                path="/"
                element={
                  <RequirePaired>
                    <MissionControl />
                  </RequirePaired>
                }
              />
              <Route
                path="/session/:sessionKey"
                element={
                  <RequirePaired>
                    <ChatView />
                  </RequirePaired>
                }
              />
              <Route path="/pair" element={<PairScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </BootGate>
    </QueryClientProvider>
  );
}

function BootGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // `?code=<...>` means the user just landed via a fresh QR — always
    // re-pair, discarding any previously-stored token. Otherwise a
    // previously-paired browser would boot straight into the stale
    // pairing and never even look at the new code.
    const hasDeepLinkCode = new URLSearchParams(window.location.search).has(
      "code",
    );
    if (hasDeepLinkCode) {
      clearPaired();
      stopEngine();
      setReady(true);
      return;
    }

    const paired = loadPaired();
    if (paired) {
      try {
        initEngine(paired);
      } catch (e) {
        console.warn("[boot] engine init failed", e);
        stopEngine();
      }
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Starting Houston…</p>
      </div>
    );
  }
  return <>{children}</>;
}

function InvalidationPump() {
  useEngineInvalidation();
  return null;
}

function RequirePaired({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  // Reactive readiness — re-render when pairing completes so the user
  // is not stuck on `/pair` after redemption finishes.
  const ready = useEngineReady();
  if (!ready) {
    // Preserve the search string (e.g. `?code=<...>` from the QR deep
    // link) when bouncing to the pair screen. Without this, auto-pairing
    // never fires because the PairScreen sees an empty search.
    return <Navigate to={{ pathname: "/pair", search: loc.search }} replace />;
  }
  return <>{children}</>;
}
