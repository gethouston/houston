/**
 * Sanctioned Anthropic (Claude Pro/Max) connect via a long-lived SETUP TOKEN.
 *
 * The old direct OAuth PKCE replay against Anthropic (Claude Code's client id,
 * see the deleted auth/anthropic-headless.ts) is server-blocked since 2026-04.
 * The sanctioned replacement is Anthropic's own `claude setup-token`, which mints
 * a long-lived token (`sk-ant-oat01…`). We never replay OAuth ourselves — that is
 * the blocked path — and we never spawn the `claude` binary either: it is an Ink
 * TUI that requires a real TTY and deadlocks on the runtime's piped stdio (probed:
 * zero bytes, no clean error). So the user PASTES a token into Houston: the
 * surfaced instruction is to create a console API key (no terminal — the
 * audience is non-technical), and a `claude setup-token` value pasted by a
 * power user is accepted just the same.
 *
 * Wire shape is unchanged: `startLogin("anthropic")` emits the same
 * `{ kind:"auth_code", url, instructions }` LoginInfo and reuses completeLogin's
 * paste promise, so the connect UX (connect.tsx / provider-login-dialog.tsx) works
 * as before — the pasted value is a token instead of an OAuth code.
 *
 * Storage: the token is stored under "anthropic" as the `api_key` PiCred variant.
 * pi-ai's anthropic provider auto-detects the `sk-ant-oat` prefix (`isOAuthToken`)
 * and switches to Bearer + Claude Code identity headers, while an `sk-ant-api03…`
 * key routes to the standard x-api-key path — so both token kinds are consumed
 * correctly with NO refresh token to hold or scrub (Gate #2's scrub is a no-op on
 * api_key entries; refresh.ts stays untouched for anthropic).
 */

/** Accepted Claude token prefixes: setup token (subscription) or console API key. */
export const ANTHROPIC_TOKEN_PREFIXES = [
  "sk-ant-oat01",
  "sk-ant-api03",
] as const;

/**
 * Where a user can mint something to paste WITHOUT a terminal: the Anthropic
 * Console's API-keys page. Surfaced as the connect `url` so the webapp can open
 * it next to the paste box. Deliberately NOT the Claude Code CLI reference:
 * Houston's audience is non-technical and the product never instructs running a
 * CLI (the 2026-08-15 incident showed "run `claude setup-token`" landing on
 * cloud users as if an infrastructure failure were their task).
 */
export const ANTHROPIC_TOKEN_HELP_URL =
  "https://console.anthropic.com/settings/keys";

/**
 * Paste-flow copy. MUST never instruct running a CLI command — new clients
 * render their own localized copy and ignore this string, but older clients
 * display it verbatim, so it stays CLI-free here too (pinned by
 * anthropic-setup-token.test.ts).
 */
const PASTE_INSTRUCTIONS =
  "Create an API key in the Anthropic Console and paste it here (starts with sk-ant-api03). A Claude setup token (sk-ant-oat01) also works.";

export type SetupTokenCallbacks = {
  /** Surface the help URL + paste instructions to the webapp (auth_code). */
  onAuth: (info: { url: string; instructions: string }) => void;
  /** Resolves with the user's pasted token via completeLogin's paste promise. */
  onManualCodeInput: () => Promise<string>;
};

export type SetupTokenDeps = {
  /** Persist the validated token (login.ts wires authStorage.set api_key). */
  store: (key: string) => void;
};

/** True for a value that looks like a Claude setup token or console API key. */
export function isAnthropicToken(value: string): boolean {
  const v = value.trim();
  return ANTHROPIC_TOKEN_PREFIXES.some((p) => v.startsWith(p));
}

/**
 * Validate the token prefix (no silent failure — junk throws a clear error the
 * login state surfaces to the user) and persist it via the injected setter.
 */
export function storeAnthropicToken(
  token: string,
  set: (key: string) => void,
): void {
  const key = token.trim();
  if (!key) throw new Error("No token provided");
  if (!isAnthropicToken(key))
    throw new Error(
      "That doesn't look like a Claude token (expected sk-ant-oat01… or sk-ant-api03…)",
    );
  set(key);
}

/**
 * Drive the anthropic connect: surface the help URL + instructions, then store
 * the `sk-ant-…` token the user pastes back. No OAuth replay, no child process.
 */
export async function runAnthropicSetupTokenLogin(
  cb: SetupTokenCallbacks,
  deps: SetupTokenDeps,
): Promise<void> {
  cb.onAuth({
    url: ANTHROPIC_TOKEN_HELP_URL,
    instructions: PASTE_INSTRUCTIONS,
  });
  const token = await cb.onManualCodeInput();
  storeAnthropicToken(token, deps.store);
}
