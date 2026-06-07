/**
 * Web entry point. Two modes:
 *
 *  - **New TS engine** (opt-in): set `VITE_NEW_ENGINE_URL`, or load with
 *    `?engine=new`. Renders the standalone OAuth + streaming-chat UI against the
 *    new houston-engine (packages/engine) via `@houston/engine-client`. None of
 *    the Tauri / old-engine code loads in this mode.
 *
 *  - **Desktop UI** (default): the existing flow — Connect screen, then the
 *    lazily-loaded app tree against the old Rust engine. Sets
 *    `window.__HOUSTON_ENGINE__` from persisted config BEFORE the app graph
 *    evaluates (app/src/lib/engine.ts reads the global at module-eval), so both
 *    `./root` and `./engine-config` are imported dynamically only on this path.
 */
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root")!;
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const params = new URLSearchParams(location.search);
const newEngineUrl =
  env.VITE_NEW_ENGINE_URL ||
  (params.get("engine") === "new" ? "http://127.0.0.1:4317" : "");

if (newEngineUrl) {
  void import("./new-engine/app").then(({ NewEngineApp }) =>
    createRoot(rootEl).render(
      <NewEngineApp baseUrl={newEngineUrl} token={env.VITE_NEW_ENGINE_TOKEN} />,
    ),
  );
} else {
  void Promise.all([import("./root"), import("./engine-config")]).then(
    ([{ Root }, { readStoredEngineConfig }]) => {
      const stored = readStoredEngineConfig();
      if (stored) window.__HOUSTON_ENGINE__ = stored;
      createRoot(rootEl).render(<Root initialConfig={stored} />);
    },
  );
}
