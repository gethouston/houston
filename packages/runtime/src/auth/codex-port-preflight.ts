import { createServer } from "node:net";

export const CODEX_OAUTH_CALLBACK_PORT = 1455;

const DEFAULT_CALLBACK_HOST = "127.0.0.1";

function callbackHost(): string {
  return process.env.PI_OAUTH_CALLBACK_HOST || DEFAULT_CALLBACK_HOST;
}

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

export function preflightCodexCallbackPort(opts?: {
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
