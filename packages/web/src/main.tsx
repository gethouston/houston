/**
 * Web entry point. The engine target is chosen at build time:
 *
 *  - **New TS engine** (`VITE_NEW_ENGINE` truthy, or a URL baked via
 *    `VITE_NEW_ENGINE_URL`): boots the FULL desktop UI (app/src) against the new
 *    houston-engine. vite.config aliases `@houston-ai/engine-client` to the
 *    new-engine adapter, so app/src runs unchanged. The engine URL + token are
 *    entered at runtime via the new-engine Connect screen (`<NewEngineRoot>`),
 *    or pre-seeded from `VITE_NEW_ENGINE_URL` / `VITE_NEW_ENGINE_TOKEN`.
 *
 *  - **Old engine** (default): the original flow — Connect screen (engine URL +
 *    token), then the lazy app tree against the old Rust engine.
 */
import { createRoot } from "react-dom/client";
import {
  readStoredEngineConfig,
  NEW_ENGINE_STORAGE_KEY,
  type EngineConfig,
} from "./engine-config";

const rootEl = document.getElementById("root")!;
const env =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const useNewEngine =
  env.VITE_NEW_ENGINE === "1" ||
  env.VITE_NEW_ENGINE === "true" ||
  Boolean(env.VITE_NEW_ENGINE_URL);

if (useNewEngine) {
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
