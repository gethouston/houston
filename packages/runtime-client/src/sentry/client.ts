import { hostname, release as osRelease, platform } from "node:os";
import { formatWithOptions } from "node:util";
import type {
  BaseTransportOptions,
  SeverityLevel,
  Transport,
} from "@sentry/core";
import {
  createStackParser,
  createTransport,
  nodeStackLineParser,
  parseStackFrames,
  Scope,
  ServerRuntimeClient,
} from "@sentry/core";
import {
  type EngineProcess,
  type EngineSentryConfig,
  resolveEngineSentryConfig,
} from "./activation";
import { addSourceContext, trimReporterFrames } from "./frames";
import { createBundleFrameMapper, defaultBundlePath } from "./map-frames";

export type LogCaptureLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface EngineSentry {
  captureException(error: unknown, extra?: Record<string, unknown>): string;
  captureLog(level: LogCaptureLevel, values: unknown[]): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

const BREADCRUMB_LEVELS: Record<LogCaptureLevel, SeverityLevel> = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warning",
  ERROR: "error",
};

function redactCredentials(message: string): string {
  return message.replace(
    /\b(token|api[_-]?key|authorization|bearer)=\S+/gi,
    "$1=[redacted]",
  );
}

const NODE_PROCESS_WARNING = /^\(node:\d+\)/;

const PROVIDER_ERROR_LINE =
  /^\[provider_error\] provider=(\S+) .*?(?:error=(\S+) )?kind=(\S+)(?: cause=(\S+))?/;

function providerErrorMeta(message: string): {
  fingerprint: string[];
  tags: Record<string, string>;
} | null {
  const m = PROVIDER_ERROR_LINE.exec(message);
  if (!m) return null;
  const provider = m[1] ?? "";
  const sdkSlug = m[2] ?? "";
  const kind = m[3] ?? "";
  const cause = m[4] ?? "";
  return {
    fingerprint: ["provider_error", provider, kind, cause, sdkSlug],
    tags: {
      provider,
      provider_error_kind: kind,
      ...(cause ? { provider_error_cause: cause } : {}),
      ...(sdkSlug ? { provider_error_sdk: sdkSlug } : {}),
    },
  };
}

function fetchTransport(options: BaseTransportOptions): Transport {
  return createTransport(options, async (request) => {
    const response = await fetch(options.url, {
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

export interface EngineSentryOptions {
  bundlePath?: string;
}

export function createEngineSentry(
  engineProcess: EngineProcess,
  config: EngineSentryConfig,
  transport: (options: BaseTransportOptions) => Transport,
  options: EngineSentryOptions = {},
): EngineSentry {
  const stackParser = createStackParser(nodeStackLineParser());
  const client = new ServerRuntimeClient({
    dsn: config.dsn,
    release: config.release,
    environment: config.environment,
    serverName: hostname(),
    platform: "node",
    runtime: process.versions.bun
      ? { name: "bun", version: process.versions.bun }
      : { name: "node", version: process.versions.node },
    stackParser,
    attachStacktrace: true,
    integrations: [],
    transport,
    maxBreadcrumbs: 100,
  });
  const scope = new Scope();
  scope.setClient(client);
  scope.setTags({
    runtime: "engine",
    engine_process: engineProcess,
    deployment: config.deployment,
    ...config.tags,
  });
  const user = { ...config.user };
  if (!user.id && config.tags.org_slug) user.id = config.tags.org_slug;
  if (Object.keys(user).length) scope.setUser(user);
  scope.setContext("os", { name: platform(), version: osRelease() });
  scope.setContext("app", {
    app_start_time: new Date(
      Date.now() - process.uptime() * 1000,
    ).toISOString(),
  });
  scope.addEventProcessor(
    createBundleFrameMapper(options.bundlePath ?? defaultBundlePath()),
  );
  scope.addEventProcessor(trimReporterFrames);
  scope.addEventProcessor(addSourceContext);
  client.init();

  let capturing = false;
  function guarded<T>(fallback: T, work: () => T): T {
    if (capturing) return fallback;
    capturing = true;
    try {
      return work();
    } catch {
      return fallback;
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
          const error = values.find((v) => v instanceof Error);
          if (error) {
            scope.captureException(error, {
              captureContext: { extra: { log_message: message } },
            });
          } else {
            scope.captureEvent({
              message,
              level: "error",
              ...(providerErrorMeta(message) ?? {}),
              threads: {
                values: [
                  {
                    stacktrace: {
                      frames: parseStackFrames(stackParser, new Error(message)),
                    },
                    crashed: false,
                    current: true,
                  },
                ],
              },
            });
          }
        }
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
