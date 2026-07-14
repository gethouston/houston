import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { formatWithOptions } from "node:util";
import { formatLogEntry, type LogLevel } from "./format";

export { formatLogEntry, type LogEntry, type LogLevel } from "./format";

type ConsoleMethod = (...values: unknown[]) => void;

export interface LogSink {
  write(line: string): void;
  close?(): Promise<void>;
}

export interface LoggerOptions {
  dataDir?: string;
  file?: string;
  level?: LogLevel;
  printLogs?: boolean;
  runId?: string;
  now?: () => Date;
  sinks?: LogSink[];
  /**
   * Forward each entry that passed the level filter, pre-formatting — the
   * crash-reporting feed (ERROR → Sentry event, others → breadcrumb). Must
   * never throw; the Sentry module's capture paths are self-guarded.
   */
  capture?: (level: LogLevel, values: unknown[]) => void;
}

export interface RuntimeLogger {
  debug(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  close(): Promise<void>;
}

const levels = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
} as const;

const envLevels = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const satisfies Record<string, LogLevel>;

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
};

export const runtimeRunId = randomUUID();

let installed:
  | {
      logger: RuntimeLogger;
      restore(): Promise<void>;
    }
  | undefined;

export function minimumLogLevel(value = process.env.HOUSTON_RUNTIME_LOG_LEVEL) {
  const key = value?.toUpperCase();
  return key && key in envLevels
    ? envLevels[key as keyof typeof envLevels]
    : "INFO";
}

export function runtimeLogFile(dataDir: string): string {
  return process.env.HOUSTON_RUNTIME_LOG_FILE || join(dataDir, "runtime.log");
}

export function shouldLog(level: LogLevel, minimum: LogLevel): boolean {
  return levels[level] >= levels[minimum];
}

export function createRuntimeLogger(opts: LoggerOptions = {}): RuntimeLogger {
  const minimum = opts.level ?? minimumLogLevel();
  const now = opts.now ?? (() => new Date());
  const run = opts.runId ?? runtimeRunId;
  const sinks =
    opts.sinks ??
    defaultSinks({
      file:
        opts.file ?? (opts.dataDir ? runtimeLogFile(opts.dataDir) : undefined),
      printLogs:
        opts.printLogs ?? process.env.HOUSTON_RUNTIME_PRINT_LOGS === "1",
    });

  function write(level: LogLevel, values: unknown[]) {
    if (!shouldLog(level, minimum)) return;
    const message = normalizeConsoleValues(values);
    const line = formatLogEntry({
      timestamp: now().toISOString(),
      level,
      run,
      message,
    });
    for (const sink of sinks) sink.write(line);
    opts.capture?.(level, message);
  }

  return {
    debug: (...values) => write("DEBUG", values),
    info: (...values) => write("INFO", values),
    warn: (...values) => write("WARN", values),
    error: (...values) => write("ERROR", values),
    async close() {
      await Promise.all(sinks.map((sink) => sink.close?.()));
    },
  };
}

export function installRuntimeLogging(opts: LoggerOptions = {}) {
  if (installed) return installed;

  const logger = createRuntimeLogger(opts);
  const previous = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  console.debug = logger.debug as ConsoleMethod;
  console.info = logger.info as ConsoleMethod;
  console.log = logger.info as ConsoleMethod;
  console.warn = logger.warn as ConsoleMethod;
  console.error = logger.error as ConsoleMethod;

  installed = {
    logger,
    async restore() {
      console.debug = previous.debug;
      console.info = previous.info;
      console.log = previous.log;
      console.warn = previous.warn;
      console.error = previous.error;
      await logger.close();
      installed = undefined;
    },
  };
  return installed;
}

function defaultSinks(opts: { file?: string; printLogs: boolean }): LogSink[] {
  const sinks: LogSink[] = [];
  if (opts.file) sinks.push(fileSink(opts.file));
  if (opts.printLogs) sinks.push(stderrSink());
  return sinks;
}

function fileSink(file: string): LogSink {
  mkdirSync(dirname(file), { recursive: true });
  const stream = createWriteStream(file, { flags: "a" });
  let failed = false;
  stream.on("error", (err) => {
    if (failed) return;
    failed = true;
    originalConsole.error(`[runtime-log] file write failed: ${err.message}`);
  });
  return streamSink(stream);
}

function stderrSink(): LogSink {
  return { write: (line) => process.stderr.write(`${line}\n`) };
}

function streamSink(stream: WriteStream): LogSink {
  return {
    write(line) {
      stream.write(`${line}\n`);
    },
    close() {
      return new Promise((resolve) => stream.end(resolve));
    },
  };
}

function normalizeConsoleValues(values: unknown[]): unknown[] {
  if (values.length === 0) return [""];
  if (typeof values[0] !== "string" || values.length === 1) return values;
  return /%[sdifjoOc%]/.test(values[0])
    ? [formatWithOptions({ colors: false }, values[0], ...values.slice(1))]
    : values;
}
