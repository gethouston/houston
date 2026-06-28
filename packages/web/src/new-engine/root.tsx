/**
 * New-engine web root: gates between the engine Connect screen (URL + token) and
 * the new-engine WebApp. Mirrors ../root.tsx, but for the new TS engine — the
 * user points the browser at any reachable Houston host at runtime, so no URL
 * needs to be baked at build time (and the token stays in this browser's
 * localStorage, never in the shipped bundle). We set window.__HOUSTON_ENGINE__
 * BEFORE WebApp lazy-loads the app graph (app/src/lib/engine.ts reads the global
 * at import).
 */
import { lazy, Suspense, useState } from "react";
import {
  clearStoredEngineConfig,
  type EngineConfig,
  NEW_ENGINE_STORAGE_KEY,
  storeEngineConfig,
} from "../engine-config";
import { EngineConnectScreen } from "./engine-connect";
import { ui } from "./styles";

const WebApp = lazy(() => import("./app").then((m) => ({ default: m.WebApp })));

export function NewEngineRoot({
  initialConfig,
}: {
  initialConfig: EngineConfig | null;
}) {
  const [config, setConfig] = useState<EngineConfig | null>(initialConfig);

  if (!config) {
    return (
      <EngineConnectScreen
        onConnect={(next) => {
          storeEngineConfig(next, NEW_ENGINE_STORAGE_KEY);
          // Set before the app chunk loads so engine.ts picks it up at import.
          window.__HOUSTON_ENGINE__ = next;
          setConfig(next);
        }}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div style={ui.page}>
          <div style={ui.muted}>Loading Houston…</div>
        </div>
      }
    >
      <WebApp
        baseUrl={config.baseUrl}
        token={config.token}
        onChangeEngine={() => {
          clearStoredEngineConfig(NEW_ENGINE_STORAGE_KEY);
          setConfig(null);
        }}
      />
    </Suspense>
  );
}
