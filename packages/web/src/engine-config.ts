/**
 * Engine connection config for the web app.
 *
 * The desktop app learns its engine endpoint from the Tauri supervisor
 * (`window.__HOUSTON_ENGINE__` injection). A browser tab has no supervisor, so
 * the user supplies the engine's base URL + token once via the Connect screen;
 * we persist it in localStorage and re-apply it on every load BEFORE the app
 * module graph evaluates (app/src/lib/engine.ts reads the global at import time).
 *
 */

export interface EngineConfig {
  baseUrl: string;
  token: string;
}

/**
 * localStorage key for the host connection. The `.new` suffix is historical
 * (it distinguished the TS host from the deleted Rust engine's key,
 * `houston.web.engine`); the VALUE must not change — existing browsers hold
 * stored configs under it.
 */
export const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";

export function readStoredEngineConfig(
  key: string = NEW_ENGINE_STORAGE_KEY,
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
  key: string = NEW_ENGINE_STORAGE_KEY,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    /* storage disabled — the in-memory config still drives this session */
  }
}

export function clearStoredEngineConfig(
  key: string = NEW_ENGINE_STORAGE_KEY,
): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
