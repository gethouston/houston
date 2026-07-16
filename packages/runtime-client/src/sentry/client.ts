import { hostname, release as osRelease, platform } from "node:os";
import { formatWithOptions } from "node:util";
import type {
  BaseTransportOptions,
  Event,
  SeverityLevel,
  StackFrame,
  Transport,
} from "@sentry/core";
import {
  createStackParser,
  createTransport,
  nodeStackLineParser,
  Scope,
  ServerRuntimeClient,
} from "@sentry/core";
import {
  type EngineProcess,
  type EngineSentryConfig,
  resolveEngineSentryConfig,
} from "./activation";

/** Levels as the engine's loggers name them (observability/logging.ts). */
export type LogCaptureLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * The engine's crash reporter. Mirrors what `sentry-tracing` gave the Rust
 * engine: explicit exception capture, plus a log feed where ERROR becomes an
 * event and every level becomes a breadcrumb riding on subsequent events.
 */
export interface EngineSentry {
  /** Capture an exception; returns the Sentry event id. */
  captureException(error: unknown, extra?: Record<string, unknown>): string;
  /** Feed one log entry: ERROR → event, every level → breadcrumb. */
  captureLog(level: LogCaptureLevel, values: unknown[]): void;
  /** Drain the transport queue (call before a crash-path `process.exit`). */
  flush(timeoutMs?: number): Promise<boolean>;
}

const BREADCRUMB_LEVELS: Record<LogCaptureLevel, SeverityLevel> = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warning",
  ERROR: "error",
};

/**
 * Redact `token=<value>`-style credentials from captured log lines. The
 * desktop host's `HOUSTON_HOST_LISTENING` banner carries the full per-boot
 * bearer on stdout (the supervisor parses it) — that line must never ride to
 * Sentry as a breadcrumb verbatim. Deliberately narrow: general breadcrumb
 * scrubbing is out of scope for beta (see production-infra.md), credentials
 * are not.
 */
function redactCredentials(message: string): string {
  return message.replace(
    /\b(token|api[_-]?key|authorization|bearer)=\S+/gi,
    "$1=[redacted]",
  );
}

/**
 * Node routes `process.emitWarning` output through `console.error` as
 * `(node:<pid>) [CODE] Warning: …` (e.g. the Claude SDK's CAN_USE_TOOL_SHADOWED
 * notice). Those are warnings mis-dressed as errors — they must ride as
 * breadcrumbs, never fire standalone error events.
 */
const NODE_PROCESS_WARNING = /^\(node:\d+\)/;

/**
 * With `attachStacktrace` on, a bare-string ERROR's synthetic stack ends inside
 * the reporter itself (the console wrap, captureLog, guarded), which would give
 * every log-site event the same misleading culprit. Trailing frames from these
 * files are popped so the innermost frame is the code that actually logged.
 * Filename-based: both production stacks are source-mapped back to the original
 * `.ts` paths (the sidecar's embedded bun sourcemap, the pod's
 * `--enable-source-maps`); an unmapped stack just stays untrimmed.
 */
const REPORTER_FRAME =
  /(?:sentry[/\\](?:client|console-capture))\.(?:m?[jt]s)$|(?:observability[/\\]logging)\.(?:m?[jt]s)$/;

function isReporterFrame(frame: StackFrame): boolean {
  return !!frame.filename && REPORTER_FRAME.test(frame.filename);
}

/** Exported for tests. Mutates and returns the event. */
export function trimReporterFrames<E extends Event>(event: E): E {
  for (const exception of event.exception?.values ?? []) {
    const frames = exception.stacktrace?.frames;
    if (!frames) continue;
    let last = frames[frames.length - 1];
    while (frames.length > 1 && last && isReporterFrame(last)) {
      frames.pop();
      last = frames[frames.length - 1];
    }
  }
  return event;
}

/**
 * Plain fetch transport — the one path that works identically on Node 22
 * (pods, self-host, dev) and inside the Bun-compiled sidecar. The heavier
 * `@sentry/node` SDK is deliberately NOT used: its OpenTelemetry require-hooks
 * don't survive `bun build --compile`.
 */
function fetchTransport(options: BaseTransportOptions): Transport {
  return createTransport(options, async (request) => {
    const response = await fetch(options.url, {
      // The envelope is string | Uint8Array; TS's DOM BodyInit doesn't admit
      // the generic Uint8Array<ArrayBufferLike>, but fetch accepts it fine.
      body: request.body as BodyInit,
      method: "POST",
    });
    return {
      statusCode: response.status,
      headers: {
        "retry-after": response.headers.get("retry-after"),
        "x-sentry-rate-limits": response.headers.get("x-sentry-rate-limits"),
      },
    };
  });
}

/**
 * Init the engine's Sentry client, or return `undefined` when the activation
 * rule says stay dormant (see ./activation.ts). Never throws — a crash
 * reporter that crashes the boot would be worse than no reporter.
 */
export function initEngineSentry(
  engineProcess: EngineProcess,
  env: Record<string, string | undefined> = process.env,
): EngineSentry | undefined {
  const config = resolveEngineSentryConfig(env);
  if (!config) return undefined;
  try {
    return createEngineSentry(engineProcess, config, fetchTransport);
  } catch (err) {
    process.stderr.write(`[engine-sentry] init failed, staying off: ${err}\n`);
    return undefined;
  }
}

/** Exported for tests (inject a capturing transport). Use initEngineSentry. */
export function createEngineSentry(
  engineProcess: EngineProcess,
  config: EngineSentryConfig,
  transport: (options: BaseTransportOptions) => Transport,
): EngineSentry {
  const client = new ServerRuntimeClient({
    dsn: config.dsn,
    release: config.release,
    environment: config.environment,
    serverName: hostname(), // the pod name on GKE — locates the agent pod
    platform: "node",
    runtime: process.versions.bun
      ? { name: "bun", version: process.versions.bun }
      : { name: "node", version: process.versions.node },
    stackParser: createStackParser(nodeStackLineParser()),
    // Bare-string ERRORs (message events) get a synthetic stack pointing at
    // the log site — without it they arrive as bare text, undebuggable.
    attachStacktrace: true,
    integrations: [],
    transport,
    maxBreadcrumbs: 100,
  });
  const scope = new Scope();
  scope.setClient(client);
  scope.setTags({
    // `runtime: engine` is the established Sentry-side convention from the
    // Rust engine era — the daily-ritual queries key on it. `engine_process`
    // tells the supervisor host apart from the per-agent runtime it spawned.
    runtime: "engine",
    engine_process: engineProcess,
    deployment: config.deployment,
    ...config.tags,
  });
  // ServerRuntimeClient attaches no contexts on its own (integrations: []).
  // OS tells Windows/macOS/Linux-pod apart; app_start_time separates a
  // boot-path crash from a long-uptime failure at a glance.
  scope.setContext("os", { name: platform(), version: osRelease() });
  scope.setContext("app", {
    app_start_time: new Date(
      Date.now() - process.uptime() * 1000,
    ).toISOString(),
  });
  scope.addEventProcessor(trimReporterFrames);
  client.init();

  // Re-entrancy guard: capture paths run inside console/log hooks, so anything
  // the capture itself logs (a transport failure, an SDK warning) must not
  // recurse back into capture.
  let capturing = false;
  function guarded<T>(fallback: T, work: () => T): T {
    if (capturing) return fallback;
    capturing = true;
    try {
      return work();
    } catch {
      return fallback; // never let the reporter take the engine down
    } finally {
      capturing = false;
    }
  }

  return {
    captureException(error, extra) {
      return guarded("", () =>
        scope.captureException(error, {
          captureContext: extra ? { extra } : undefined,
        }),
      );
    },
    captureLog(level, values) {
      guarded(undefined, () => {
        const message = redactCredentials(
          formatWithOptions(
            { colors: false },
            ...(values as [unknown, ...unknown[]]),
          ),
        );
        const demoted = level === "ERROR" && NODE_PROCESS_WARNING.test(message);
        if (level === "ERROR" && !demoted) {
          // A real Error in the values gives Sentry a stack to group on; a
          // bare string ERROR gets a synthetic stack at the log site
          // (attachStacktrace) and groups on that.
          const error = values.find((v) => v instanceof Error);
          if (error) {
            scope.captureException(error, {
              captureContext: { extra: { log_message: message } },
            });
          } else {
            scope.captureMessage(message, "error");
          }
        }
        // Breadcrumb AFTER capture so an ERROR event doesn't carry itself.
        scope.addBreadcrumb(
          {
            category: "log",
            level: demoted ? "warning" : BREADCRUMB_LEVELS[level],
            message,
          },
          100,
        );
      });
    },
    flush(timeoutMs = 2000) {
      return Promise.resolve(client.flush(timeoutMs)).catch(() => false);
    },
  };
}
