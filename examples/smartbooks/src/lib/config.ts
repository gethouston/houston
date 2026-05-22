/**
 * Connection config resolved from three sources, in priority order:
 *
 * 1. `localStorage["smartbooks.engine"]` — user-set via the Connect
 *    screen. Wins so "Disconnect + paste new URL" works.
 * 2. `import.meta.env.VITE_HOUSTON_ENGINE_BASE` + `..._TOKEN` — build-time
 *    env, for customers wiring SmartBooks into their own deploy pipeline.
 * 3. Demo defaults (`http://127.0.0.1:7777` + `dev-token`) — match exactly
 *    what the README tells you to start the engine with, so cloning +
 *    `bun run dev` opens straight into the chat.
 *
 * `smartbooks.agent` caches the resolved `{ workspaceId, agentPath,
 * sessionKey }` so we don't recreate on every reload.
 */

const ENGINE_KEY = "smartbooks.engine";
const AGENT_KEY = "smartbooks.agent";

/** Hardcoded demo defaults — see README "Run it". Dev-token is NOT a secret. */
const DEMO_DEFAULT: EngineConfig = {
  baseUrl: "http://127.0.0.1:7777",
  token: "dev-token",
};

export interface EngineConfig {
  baseUrl: string;
  token: string;
}

export interface AgentConfig {
  workspaceId: string;
  agentPath: string;
  sessionKey: string;
}

/** Resolved config for this launch. Never null — always returns SOMETHING to try. */
export function resolveEngineConfig(): EngineConfig {
  const stored = loadEngineConfig();
  if (stored) return stored;
  const envBase = (import.meta as ImportMetaWithEnv).env?.VITE_HOUSTON_ENGINE_BASE;
  const envToken = (import.meta as ImportMetaWithEnv).env?.VITE_HOUSTON_ENGINE_TOKEN;
  if (envBase && envToken) return { baseUrl: envBase, token: envToken };
  return DEMO_DEFAULT;
}

/** `true` if the user has explicitly set an engine via the Connect screen. */
export function hasUserOverride(): boolean {
  return loadEngineConfig() !== null;
}

export function loadEngineConfig(): EngineConfig | null {
  const raw = localStorage.getItem(ENGINE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.baseUrl && parsed.token) return parsed as EngineConfig;
  } catch {
    /* fall through */
  }
  return null;
}

// Vite injects `import.meta.env` but `import.meta` itself is `any` in lib.dom.
// Narrow here so the rest of the file stays typed.
interface ImportMetaWithEnv {
  env?: {
    VITE_HOUSTON_ENGINE_BASE?: string;
    VITE_HOUSTON_ENGINE_TOKEN?: string;
  };
}

export function saveEngineConfig(cfg: EngineConfig): void {
  localStorage.setItem(ENGINE_KEY, JSON.stringify(cfg));
}

export function clearEngineConfig(): void {
  localStorage.removeItem(ENGINE_KEY);
  localStorage.removeItem(AGENT_KEY);
}

export function loadAgentConfig(): AgentConfig | null {
  const raw = localStorage.getItem(AGENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentConfig;
  } catch {
    return null;
  }
}

export function saveAgentConfig(cfg: AgentConfig): void {
  localStorage.setItem(AGENT_KEY, JSON.stringify(cfg));
}
