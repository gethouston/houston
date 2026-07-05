/**
 * Web entry point. The Houston host is the only engine — the full desktop UI
 * (app/src) always runs against it (vite.config aliases
 * `@houston-ai/engine-client` to the host adapter). Which root mounts depends
 * only on the deployment:
 *
 *  - **Cloud host** (`VITE_CONTROL_PLANE_URL`): the app's own Supabase auth
 *    gates sign-in (plus the `/admin` operator dashboard on that path).
 *  - **Default**: `<NewEngineRoot>` — the host URL + token come from a stored
 *    config, are pre-seeded via `VITE_NEW_ENGINE_URL` / `VITE_NEW_ENGINE_TOKEN`,
 *    or are entered at runtime on the Connect screen.
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
} else {
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
}
