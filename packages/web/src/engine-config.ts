/**
 * Engine connection config for the web app.
 *
 * The desktop app learns its engine endpoint from the Tauri supervisor
 * (`window.__HOUSTON_ENGINE__` injection). A browser tab has no supervisor, so
 * the user supplies the remote engine's base URL + token once via the Connect
 * screen; we persist it in localStorage and re-apply it on every load BEFORE
 * the app module graph evaluates (app/src/lib/engine.ts reads the global at
 * import time).
 */

export interface EngineConfig {
  baseUrl: string;
  token: string;
}

const STORAGE_KEY = "houston.web.engine";

export function readStoredEngineConfig(): EngineConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EngineConfig>;
    if (
      typeof parsed.baseUrl === "string" &&
      parsed.baseUrl &&
      typeof parsed.token === "string" &&
      parsed.token
    ) {
      return { baseUrl: parsed.baseUrl, token: parsed.token };
    }
  } catch {
    /* corrupt JSON or storage disabled — treat as unconfigured */
  }
  return null;
}

export function storeEngineConfig(config: EngineConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage disabled — the in-memory config still drives this session */
  }
}

export function clearStoredEngineConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
