// A tiny logging seam for the identity module.
//
// WHY a seam and not a direct `import { logger } from "../logger"`: the app
// logger pulls in the Tauri `os-bridge` graph, which is unresolvable under the
// `node:test` unit runner — so any module that imports it can't be unit-tested
// (this is why the repo keeps tested logic modules dependency-light). The
// identity leaf parsers (session.ts, id-token.ts) MUST stay testable AND must
// log every discard (no-silent-failures / design §6.8). This seam squares both:
//
//   • Wave 2 calls `setIdentityLogSink((l, m, c) => logger[l](m, c))` once at
//     app startup, so discards reach `frontend.log` in production.
//   • Until then (and in tests) the fallback writes to `console` — a discard is
//     NEVER silent even before wiring.

export type IdentityLogLevel = "error" | "warn" | "info" | "debug";
export type IdentityLogSink = (
  level: IdentityLogLevel,
  message: string,
  context?: string,
) => void;

let sink: IdentityLogSink | null = null;

/** Wire identity logs to the app logger (Wave 2, at startup). */
export function setIdentityLogSink(next: IdentityLogSink | null): void {
  sink = next;
}

/** Emit a structured identity log. Falls back to `console` when unwired. */
export function identityLog(
  level: IdentityLogLevel,
  message: string,
  context = "identity",
): void {
  if (sink) {
    sink(level, message, context);
    return;
  }
  const line = `[${context}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
