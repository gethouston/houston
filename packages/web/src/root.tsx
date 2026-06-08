/**
 * Web root: gates between the Connect screen and the (lazily-loaded) app tree.
 *
 * Why lazy: app/src/lib/engine.ts reads `window.__HOUSTON_ENGINE__` at module
 * load. We must set that global BEFORE the app graph evaluates. main.tsx sets it
 * from localStorage pre-mount; the Connect screen sets it on submit. In both
 * cases the app tree is only imported AFTER the global is in place, so the
 * engine client bootstraps cleanly and EngineGate resolves immediately.
 */
import { lazy, Suspense, useState } from "react";
import { ConnectScreen } from "./components/connect-screen";
import { BootSplash } from "./components/boot-splash";
import { storeEngineConfig, type EngineConfig } from "./engine-config";

const AppTree = lazy(() => import("./app-tree"));

export function Root({ initialConfig }: { initialConfig: EngineConfig | null }) {
  const [config, setConfig] = useState<EngineConfig | null>(initialConfig);

  if (!config) {
    return (
      <ConnectScreen
        onConnect={(next) => {
          storeEngineConfig(next);
          // Set before the app chunk loads so engine.ts picks it up at import.
          window.__HOUSTON_ENGINE__ = next;
          setConfig(next);
        }}
      />
    );
  }

  return (
    <Suspense fallback={<BootSplash />}>
      <AppTree />
    </Suspense>
  );
}
