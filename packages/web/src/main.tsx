/**
 * Web entry point.
 *
 * Sets the engine handshake global from persisted config BEFORE anything from
 * app/src loads (app/src/lib/engine.ts reads `window.__HOUSTON_ENGINE__` at
 * module-eval). Then mounts <Root>, which shows the Connect screen when there's
 * no config yet and lazy-loads the app tree once connected.
 *
 * Note: this module must NOT statically import the app tree (only root.tsx's
 * lazy import may), or engine.ts would evaluate before the global is set.
 */
import { createRoot } from "react-dom/client";
import { Root } from "./root";
import { readStoredEngineConfig } from "./engine-config";

const stored = readStoredEngineConfig();
if (stored) {
  window.__HOUSTON_ENGINE__ = stored;
}

createRoot(document.getElementById("root")!).render(
  <Root initialConfig={stored} />,
);
