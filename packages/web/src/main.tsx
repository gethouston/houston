/**
 * Web entry point. The Houston host is the only engine — the full desktop UI
 * (app/src) always runs against it (vite.config aliases
 * `@houston-ai/engine-client` to the host adapter). Which root mounts depends
 * only on the deployment:
 *
 *  - **Cloud host** (`VITE_CONTROL_PLANE_URL`): the app's own GCIP (Firebase)
 *    auth gates sign-in (plus the `/admin` operator dashboard on that path).
 *  - **Default**: `<NewEngineRoot>` — the host URL + token come from a stored
 *    config, are pre-seeded via `VITE_NEW_ENGINE_URL` / `VITE_NEW_ENGINE_TOKEN`,
 *    or are entered at runtime on the Connect screen.
 */
import { applyBootTheme } from "@houston/app/lib/theme-boot";
import { createRoot } from "react-dom/client";
import { applyHostModeGlobals } from "./boot-globals";
import { currentDeployEnvironment } from "./deploy-environment";
import {
  type EngineConfig,
  NEW_ENGINE_STORAGE_KEY,
  readStoredEngineConfig,
} from "./engine-config";

// Publish the runtime deploy environment BEFORE the app module graph loads: the
// shared Sentry + PostHog init (app/src) read `window.__HOUSTON_DEPLOY_ENV__` to
// tag their `environment`, and those run as soon as `./app-tree` is imported
// below. ONE bundle serves both sites, so this is derived from the hostname, not
// baked at build time (see ./deploy-environment).
window.__HOUSTON_DEPLOY_ENV__ = currentDeployEnvironment();

// Theme BEFORE the first paint, on the same contract as the desktop entry
// (app/src/main.tsx): the engine preference is the source of truth but only
// answers after the handshake, and the boot splash renders during it on the
// themed surface. Applying the device-local mirror here — a leaf module with no
// app-graph imports, so it costs nothing before the lazy chunk loads — keeps a
// dark-mode user from flashing the light surface. `loadTheme()` in ./app-tree
// reconciles against the engine once the handshake lands.
applyBootTheme();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");
const env =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const controlPlaneUrl = env.VITE_CONTROL_PLANE_URL || "";

// Same contract as the deploy environment above, for the Sentry `deployment`
// tag: ONE web bundle serves the managed cloud (a baked control plane) and the
// self-host Connect screen, so only this entry knows which one a tab is. The
// shared Sentry init reads it (app/src/lib/sentry-deployment.ts) — set it
// before the app graph loads.
window.__HOUSTON_DEPLOYMENT__ = controlPlaneUrl ? "managed-cloud" : "selfhost";

if (controlPlaneUrl && window.location.pathname.startsWith("/admin")) {
  // Operator dashboard (served at /admin by nginx try_files): pods-per-user + GCP
  // spend. Its own GCIP (Firebase) sign-in + control-plane /admin/* calls; the
  // desktop UI never mounts here.
  void import("./admin/dashboard").then(({ AdminDashboard }) =>
    createRoot(rootEl).render(
      <AdminDashboard controlPlaneUrl={controlPlaneUrl} />,
    ),
  );
} else if (controlPlaneUrl) {
  // Cloud host mode: the app's own GCIP (Firebase) auth gates sign-in, then the desktop UI
  // boots in host mode. app/src/lib/engine.ts reads these globals at
  // module-eval (which fires as soon as cloud-login statically imports the app
  // tree), so they MUST be set before that import — otherwise EngineGate hangs
  // on the "Loading your workspace" splash. CloudApp keeps the token in sync with the
  // live session; the engine adapter reads it live per request.
  applyHostModeGlobals(window, { baseUrl: controlPlaneUrl, token: "" });
  void import("./cloud-login").then(({ CloudApp }) =>
    createRoot(rootEl).render(<CloudApp controlPlaneUrl={controlPlaneUrl} />),
  );
} else {
  // Self-host: resolve the engine config before the app graph loads
  // (app/src/lib/engine.ts reads window.__HOUSTON_ENGINE__ at import) — a
  // stored config wins, else a URL baked via VITE_NEW_ENGINE_URL, else null
  // → the Connect screen prompts. Host mode is published by the SAME call as
  // the cloud branch above (PRODUCT-1627): this branch used to inherit the
  // flag only from an app/src module-load side effect, and an adapter built
  // before that side effect ran would read empty routines/skills lists with
  // no error at all.
  const stored = readStoredEngineConfig(NEW_ENGINE_STORAGE_KEY);
  const initial: EngineConfig | null =
    stored ??
    (env.VITE_NEW_ENGINE_URL
      ? {
          baseUrl: env.VITE_NEW_ENGINE_URL,
          token: env.VITE_NEW_ENGINE_TOKEN ?? "",
        }
      : null);
  applyHostModeGlobals(window, initial);
  void import("./new-engine/root").then(({ NewEngineRoot }) =>
    createRoot(rootEl).render(<NewEngineRoot initialConfig={initial} />),
  );
}
