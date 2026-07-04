/**
 * Sanctioned Anthropic (Claude Pro/Max) connect via a long-lived SETUP TOKEN.
 *
 * The old direct OAuth PKCE replay against Anthropic (Claude Code's client id,
 * see the deleted auth/anthropic-headless.ts) is server-blocked since 2026-04.
 * The sanctioned replacement is Anthropic's own `claude setup-token`, which mints
 * a long-lived token (`sk-ant-oat01…`). We never replay OAuth ourselves — that is
 * the blocked path — and we never spawn the `claude` binary either: it is an Ink
 * TUI that requires a real TTY and deadlocks on the runtime's piped stdio (probed:
 * zero bytes, no clean error). So the user runs `claude setup-token` in their own
 * terminal (or creates a console API key) and PASTES the token into Houston.
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
 * Official Claude Code CLI reference (documents `claude setup-token`). Surfaced
 * as the connect `url` so the webapp can open it next to the paste box.
 */
export const ANTHROPIC_TOKEN_HELP_URL =
  "https://docs.claude.com/en/docs/claude-code/cli-reference";

const PASTE_INSTRUCTIONS =
  "Run `claude setup-token` in your terminal, then paste the token it prints (starts with sk-ant-oat01). A console API key (sk-ant-api03) also works.";

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
