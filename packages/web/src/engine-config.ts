export interface EngineConfig {
  baseUrl: string;
  token: string;
}

export const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";

export function readStoredEngineConfig(
  key: string = NEW_ENGINE_STORAGE_KEY,
): EngineConfig | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EngineConfig>;
    if (
      typeof parsed.baseUrl === "string" &&
      parsed.baseUrl &&
      typeof parsed.token === "string"
    ) {
      return { baseUrl: parsed.baseUrl, token: parsed.token };
    }
  } catch {}
  return null;
}

export function storeEngineConfig(
  config: EngineConfig,
  key: string = NEW_ENGINE_STORAGE_KEY,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {}
}

export function clearStoredEngineConfig(
  key: string = NEW_ENGINE_STORAGE_KEY,
): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}
