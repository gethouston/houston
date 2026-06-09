/**
 * Engine connection config for the web app.
 *
 * The desktop app learns its engine endpoint from the Tauri supervisor
 * (`window.__HOUSTON_ENGINE__` injection). A browser tab has no supervisor, so
 * the user supplies the engine's base URL + token once via the Connect screen;
 * we persist it in localStorage and re-apply it on every load BEFORE the app
 * module graph evaluates (app/src/lib/engine.ts reads the global at import time).
 *
 * Old (Rust) and new (TS) engines speak different protocols, so each gets its
 * own storage key — switching the deployment's engine target never reuses a
 * stale endpoint from the other.
 */

export interface EngineConfig {
  baseUrl: string;
  token: string;
}

/** localStorage key for the old (Rust) engine connection. */
export const OLD_ENGINE_STORAGE_KEY = "houston.web.engine";
/** localStorage key for the new (TS) engine connection. */
export const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";

export function readStoredEngineConfig(
  key: string = OLD_ENGINE_STORAGE_KEY,
): EngineConfig | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EngineConfig>;
    // baseUrl is required; token may be empty (new engine can run open).
    if (
      typeof parsed.baseUrl === "string" &&
      parsed.baseUrl &&
      typeof parsed.token === "string"
    ) {
      return { baseUrl: parsed.baseUrl, token: parsed.token };
    }
  } catch {
    /* corrupt JSON or storage disabled — treat as unconfigured */
  }
  return null;
}

export function storeEngineConfig(
  config: EngineConfig,
  key: string = OLD_ENGINE_STORAGE_KEY,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    /* storage disabled — the in-memory config still drives this session */
  }
}

export function clearStoredEngineConfig(
  key: string = OLD_ENGINE_STORAGE_KEY,
): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
