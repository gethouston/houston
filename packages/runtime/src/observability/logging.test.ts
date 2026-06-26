import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRuntimeLogger,
  formatLogEntry,
  installRuntimeLogging,
  minimumLogLevel,
  runtimeLogFile,
  shouldLog,
} from "./logging";

const ts = new Date("2026-01-02T03:04:05.006Z");

afterEach(async () => {
  delete process.env.HOUSTON_RUNTIME_LOG_FILE;
  delete process.env.HOUSTON_RUNTIME_LOG_LEVEL;
  delete process.env.HOUSTON_RUNTIME_PRINT_LOGS;
});

test("formatLogEntry writes structured key-value logs", () => {
  const circular: Record<string, unknown> = { id: "user-1" };
  circular.self = circular;

  const line = formatLogEntry({
    timestamp: ts.toISOString(),
    level: "Info",
    run: "run-1",
    message: [
      "Session started",
      {
        request: { id: "req-1" },
        spaced: "needs quotes",
        equals: "a=b",
        circular,
      },
    ],
    annotations: { provider: "openai", retryCount: 3 },
  });

  expect(line).toBe(
    'timestamp=2026-01-02T03:04:05.006Z level=Info run=run-1 message="Session started" request.id=req-1 spaced="needs quotes" equals="a=b" circular.id=user-1 circular.self=[Circular] provider=openai retryCount=3',
  );
});

test("minimumLogLevel defaults to Info and accepts standard levels", () => {
  expect(minimumLogLevel()).toBe("Info");
  expect(minimumLogLevel("debug")).toBe("Debug");
  expect(minimumLogLevel("INFO")).toBe("Info");
  expect(minimumLogLevel("warn")).toBe("Warn");
  expect(minimumLogLevel("ERROR")).toBe("Error");
  expect(minimumLogLevel("trace")).toBe("Info");
});

test("logger filters below the configured level", () => {
  const lines: string[] = [];
  const logger = createRuntimeLogger({
    level: "Warn",
    now: () => ts,
    runId: "run-2",
    sinks: [{ write: (line) => lines.push(line) }],
  });

  logger.debug("debug");
  logger.info("info");
  logger.warn("warn");
  logger.error("error");

  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("level=Warn");
  expect(lines[1]).toContain("level=Error");
  expect(shouldLog("Debug", "Info")).toBe(false);
  expect(shouldLog("Error", "Info")).toBe(true);
});

test("logger appends to the runtime log file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "houston-runtime-log-"));
  const file = join(dir, "runtime.log");
  try {
    const logger = createRuntimeLogger({
      file,
      level: "Debug",
      now: () => ts,
      printLogs: false,
      runId: "file-run",
    });

    logger.debug("Processing request", {
      endpoint: "/api/v1/session",
      requestId: "req-xyz789",
    });
    logger.error("Failed to connect", {
      provider: "openai",
      retryCount: 3,
    });
    await logger.close();

    const text = await readFile(file, "utf8");
    expect(text).toContain(
      'level=Debug run=file-run message="Processing request" endpoint=/api/v1/session requestId=req-xyz789',
    );
    expect(text).toContain(
      'level=Error run=file-run message="Failed to connect" provider=openai retryCount=3',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtimeLogFile supports env override", () => {
  process.env.HOUSTON_RUNTIME_LOG_FILE = "/tmp/custom-runtime.log";
  expect(runtimeLogFile("/tmp/data")).toBe("/tmp/custom-runtime.log");
});

test("logger prints to stderr when requested", async () => {
  const write = process.stderr.write;
  let printed = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    printed += chunk.toString();
    return true;
  }) as typeof process.stderr.write;

  try {
    const logger = createRuntimeLogger({
      level: "Info",
      now: () => ts,
      printLogs: true,
      runId: "stderr-run",
    });
    logger.info("terminal visible");
    await logger.close();
  } finally {
    process.stderr.write = write;
  }

  expect(printed).toContain(
    'level=Info run=stderr-run message="terminal visible"',
  );
});

test("installRuntimeLogging bridges console methods", async () => {
  const lines: string[] = [];
  const installed = installRuntimeLogging({
    level: "Debug",
    now: () => ts,
    runId: "console-run",
    sinks: [{ write: (line) => lines.push(line) }],
  });

  try {
    console.debug("debug %d", 7);
    console.log("plain info", { route: "/health" });
    console.warn("slow request", { ms: 45 });
    console.error("boom", new Error("failed"));
  } finally {
    await installed.restore();
  }

  expect(lines[0]).toContain('level=Debug run=console-run message="debug 7"');
  expect(lines[1]).toContain(
    'level=Info run=console-run message="plain info" route=/health',
  );
  expect(lines[2]).toContain("level=Warn");
  expect(lines[2]).toContain("ms=45");
  expect(lines[3]).toContain("level=Error");
  expect(lines[3]).toContain("message=boom");
  expect(lines[3]).toContain("failed");
});
