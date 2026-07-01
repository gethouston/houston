/**
 * Web entry point. The engine target is chosen at build time:
 *
 *  - **New TS engine host** (`VITE_NEW_ENGINE` truthy, or a URL baked via
 *    `VITE_NEW_ENGINE_URL`): boots the FULL desktop UI (app/src) against the new
 *    Houston host. vite.config aliases `@houston-ai/engine-client` to the
 *    new-engine adapter, so app/src runs unchanged. The engine URL + token are
 *    entered at runtime via the new-engine Connect screen (`<NewEngineRoot>`),
 *    or pre-seeded from `VITE_NEW_ENGINE_URL` / `VITE_NEW_ENGINE_TOKEN`.
 *
 *  - **Old engine** (default): the original flow — Connect screen (engine URL +
 *    token), then the lazy app tree against the old Rust engine.
 */
import { createRoot } from "react-dom/client";
import {
  type EngineConfig,
  NEW_ENGINE_STORAGE_KEY,
  readStoredEngineConfig,
} from "./engine-config";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");
const env =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const controlPlaneUrl = env.VITE_CONTROL_PLANE_URL || "";

const useNewEngine =
  env.VITE_NEW_ENGINE === "1" ||
  env.VITE_NEW_ENGINE === "true" ||
  Boolean(env.VITE_NEW_ENGINE_URL);

if (controlPlaneUrl && window.location.pathname.startsWith("/admin")) {
  // Operator dashboard (served at /admin by nginx try_files): pods-per-user + GCP
  // spend. Its own Supabase sign-in + control-plane /admin/* calls; the desktop UI
  // never mounts here.
  void import("./admin/dashboard").then(({ AdminDashboard }) =>
    createRoot(rootEl).render(
      <AdminDashboard controlPlaneUrl={controlPlaneUrl} />,
    ),
  );
} else if (controlPlaneUrl) {
  // Cloud host mode: the app's own Supabase auth gates sign-in, then the desktop UI
  // boots in host mode. app/src/lib/engine.ts reads these globals at
  // module-eval (which fires as soon as cloud-login statically imports the app
  // tree), so they MUST be set before that import — otherwise EngineGate hangs
  // on "Starting Houston engine". CloudApp keeps the token in sync with the
  // live session; the engine adapter reads it live per request.
  window.__HOUSTON_CP__ = true;
  window.__HOUSTON_ENGINE__ = { baseUrl: controlPlaneUrl, token: "" };
  void import("./cloud-login").then(({ CloudApp }) =>
    createRoot(rootEl).render(<CloudApp controlPlaneUrl={controlPlaneUrl} />),
  );
} else if (useNewEngine) {
  // Resolve the engine config before the app graph loads (app/src/lib/engine.ts
  // reads window.__HOUSTON_ENGINE__ at import): a stored config wins, else a URL
  // baked via VITE_NEW_ENGINE_URL, else null → the Connect screen prompts.
  const stored = readStoredEngineConfig(NEW_ENGINE_STORAGE_KEY);
  const initial: EngineConfig | null =
    stored ??
    (env.VITE_NEW_ENGINE_URL
      ? {
          baseUrl: env.VITE_NEW_ENGINE_URL,
          token: env.VITE_NEW_ENGINE_TOKEN ?? "",
        }
      : null);
  if (initial) window.__HOUSTON_ENGINE__ = initial;
  void import("./new-engine/root").then(({ NewEngineRoot }) =>
    createRoot(rootEl).render(<NewEngineRoot initialConfig={initial} />),
  );
} else {
  const stored = readStoredEngineConfig();
  if (stored) window.__HOUSTON_ENGINE__ = stored;
  void import("./root").then(({ Root }) =>
    createRoot(rootEl).render(<Root initialConfig={stored} />),
  );
}
