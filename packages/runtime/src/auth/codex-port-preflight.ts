import { createServer } from "node:net";

/**
 * The FIXED loopback callback port the OpenAI/Codex browser (loopback) OAuth
 * login binds in-process. It mirrors pi-ai's hardcoded
 * `REDIRECT_URI = "http://localhost:1455/auth/callback"`
 * (`@earendil-works/pi-ai` → `utils/oauth/openai-codex.ts`), which pi does NOT
 * export — so it is duplicated here by value. If pi ever changes that port,
 * change it here too.
 */
export const CODEX_OAUTH_CALLBACK_PORT = 1455;

/**
 * The host pi binds the callback server on — its `getCallbackHost()` reads
 * `PI_OAUTH_CALLBACK_HOST` and defaults to loopback. We mirror it exactly so the
 * preflight probes the SAME address pi will, honouring the same override.
 */
const DEFAULT_CALLBACK_HOST = "127.0.0.1";

function callbackHost(): string {
  return process.env.PI_OAUTH_CALLBACK_HOST || DEFAULT_CALLBACK_HOST;
}

/**
 * Raised when the Codex sign-in callback port is already taken — a real Codex
 * CLI running, or a stray prior login squatting the port. The message is
 * written FOR the non-technical user (name the remedy, not the errno). The
 * stable `kind` lets the transport tag the wire error so the frontend can route
 * this actionable message to the sign-in toast instead of flattening it.
 */
export class CodexCallbackPortInUseError extends Error {
  readonly kind = "codex_callback_port_busy" as const;
  constructor(cause?: unknown) {
    super(
      `Another app on this computer is using the sign-in port (${CODEX_OAUTH_CALLBACK_PORT}). Close other AI coding tools and try again.`,
      { cause },
    );
    this.name = "CodexCallbackPortInUseError";
  }
}

/**
 * Preflight the Codex browser-login callback port BEFORE handing off to pi.
 *
 * pi's `startLocalOAuthServer` attaches `.on("error", …)` to its callback
 * server WITHOUT rethrowing: on `EADDRINUSE` it resolves a stub whose
 * `waitForCode()` returns null, so the browser opens, the user approves at
 * OpenAI, the redirect lands on whoever holds the port, and Houston spins for
 * the full 10-minute window before a generic timeout — no log, no remedy. pi is
 * an external dependency we cannot patch, so we probe the exact `host:port` pi
 * will bind and fail fast with an actionable error, before any browser opens.
 *
 * Binds and immediately closes a throwaway listener: success means the port is
 * free (pi will get it); a bind error means it is occupied.
 */
export function preflightCodexCallbackPort(opts?: {
  /** Test seam: probe a different port so parallel test files never contend
   *  for the real 1455. Production callers pass nothing. */
  port?: number;
  host?: string;
}): Promise<void> {
  const port = opts?.port ?? CODEX_OAUTH_CALLBACK_PORT;
  const host = opts?.host ?? callbackHost();
  return new Promise<void>((resolve, reject) => {
    const server = createServer();
    const onError = (err: unknown) => {
      server.close();
      reject(new CodexCallbackPortInUseError(err));
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      server.close(() => resolve());
    });
  });
}
