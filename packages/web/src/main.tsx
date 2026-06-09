/**
 * Web entry point. Two modes:
 *
 *  - **New TS engine** (set `VITE_NEW_ENGINE_URL`): boots the FULL desktop UI
 *    (app/src) against the new houston-engine. vite.config aliases
 *    `@houston-ai/engine-client` to the new-engine adapter, so app/src runs
 *    unchanged. `<WebApp>` first ensures a subscription provider is connected
 *    (OAuth) before mounting the desktop tree.
 *
 *  - **Old engine** (default): the original flow — Connect screen (engine URL +
 *    token), then the lazy app tree against the old Rust engine.
 */
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root")!;
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const newEngineUrl = env.VITE_NEW_ENGINE_URL || "";
const controlPlaneUrl = env.VITE_CONTROL_PLANE_URL || "";

if (controlPlaneUrl && window.location.pathname.startsWith("/admin")) {
  // Operator dashboard (served at /admin by nginx try_files): pods-per-user + GCP
  // spend. Its own Supabase sign-in + control-plane /admin/* calls; the desktop UI
  // never mounts here.
  void import("./admin/dashboard").then(({ AdminDashboard }) =>
    createRoot(rootEl).render(<AdminDashboard controlPlaneUrl={controlPlaneUrl} />),
  );
} else if (controlPlaneUrl) {
  // Cloud mode: a Supabase login gate signs the user in, then boots the desktop
  // UI in control-plane mode with their access token. CloudApp sets
  // window.__HOUSTON_ENGINE__ + __HOUSTON_CP__ before <WebApp> mounts.
  void import("./cloud-login").then(({ CloudApp }) =>
    createRoot(rootEl).render(<CloudApp controlPlaneUrl={controlPlaneUrl} />),
  );
} else if (newEngineUrl) {
  // app/src/lib/engine.ts reads this global at module-eval; set it before the
  // app tree (lazily imported inside WebApp) loads.
  window.__HOUSTON_ENGINE__ = { baseUrl: newEngineUrl, token: env.VITE_NEW_ENGINE_TOKEN ?? "" };
  void import("./new-engine/app").then(({ WebApp }) =>
    createRoot(rootEl).render(
      <WebApp baseUrl={newEngineUrl} token={env.VITE_NEW_ENGINE_TOKEN} />,
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
