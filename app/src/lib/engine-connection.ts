/**
 * Runtime engine-connection choice for the desktop app (HOU-621).
 *
 * The default Rust build learns its engine endpoint from the Tauri supervisor
 * and never sees this. In the TS-engine build (`VITE_NEW_ENGINE=1`) the login
 * screen instead asks the user whether Houston should run on this computer
 * (the host sidecar) or connect to a remote engine / gateway URL. The pick is
 * persisted here and read SYNCHRONOUSLY at `engine.ts` module load — the same
 * "set before any client is built" invariant HOU-546 relies on — so applying a
 * new choice reloads the webview to re-run that module deterministically.
 *
 * localStorage (not the Keychain used for auth tokens) is deliberate: the value
 * is a non-secret URL + mode, and the read has to be synchronous at module
 * load. Mirrors packages/web's `engine-config.ts`, which does the same for the
 * browser build.
 */

import type { RuntimeConnection } from "./engine-mode";

/** localStorage key for the desktop runtime engine-connection choice. */
export const ENGINE_CONNECTION_KEY = "houston.engineConnection";

/**
 * Read the persisted choice. Returns null when nothing is stored (the chooser
 * has not been answered) or the stored value is unusable — either way the
 * caller falls back to showing the chooser.
 */
export function getEngineConnection(): RuntimeConnection | null {
  try {
    const raw = localStorage.getItem(ENGINE_CONNECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RuntimeConnection>;
    if (parsed.mode === "local") return { mode: "local" };
    if (
      parsed.mode === "remote" &&
      typeof parsed.url === "string" &&
      parsed.url
    ) {
      return { mode: "remote", url: parsed.url };
    }
  } catch {
    /* corrupt JSON or storage disabled — treat as unconfigured */
  }
  return null;
}

/** Persist the user's connection choice. */
export function setEngineConnection(choice: RuntimeConnection): void {
  try {
    localStorage.setItem(ENGINE_CONNECTION_KEY, JSON.stringify(choice));
  } catch {
    /* storage disabled — the reload below will just re-show the chooser */
  }
}

/** Forget the connection choice (sign-out returns the user to the chooser). */
export function clearEngineConnection(): void {
  try {
    localStorage.removeItem(ENGINE_CONNECTION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Normalize a user-typed engine address into a base URL, or null when it is not
 * a usable http(s) address.
 *
 * - a bare host (`engine.example.com`) gets `https://` prepended;
 * - an explicit `http://` / `https://` is kept (so `http://localhost:3000`
 *   works for a dev host);
 * - any other scheme (or unparseable input) is rejected;
 * - the trailing slash is stripped while any explicit port / path is kept, so
 *   the engine client can append `/v1/...` cleanly.
 */
export function normalizeEngineUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][\w+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}
