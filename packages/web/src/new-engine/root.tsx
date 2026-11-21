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
