import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { checkStoredIsolation, probeAuthFailureLeak } from "./claim-assertions";
import {
  type Agent,
  fireTurn,
  PREFIXES,
  seedVariant,
  TOKENS,
} from "./claim-path-support";
import { printReport, type TurnResult } from "./claim-report";
import { startEchoProvider } from "./echo-provider";

const providerEnvKeys = () =>
  Object.keys(process.env).filter(
    (key) =>
      key.startsWith("ANTHROPIC_") ||
      key.startsWith("OPENAI_") ||
      key.endsWith("_API_KEY"),
  );
const scrubbedProviderEnv = providerEnvKeys();
for (const key of scrubbedProviderEnv) delete process.env[key];
const runtimeEnvPure = providerEnvKeys().length === 0;

const scratch = mkdtempSync(join(tmpdir(), "houston-claim-spike-"));
process.env.HOUSTON_TURN_TIMINGS = "1";
process.env.HOUSTON_MODE = "turn";
process.env.HOUSTON_DATA_DIR = join(scratch, "process-data");
process.env.HOUSTON_WORKSPACE_DIR = join(scratch, "process-workspace");
process.env.HOUSTON_CODE_EXECUTION = "disabled";

type Variant = keyof typeof PREFIXES;

function numericArg(name: string, fallback: number): number {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const firstArg = process.argv[2];
  const positional =
    name === "turns" && firstArg && /^\d+$/.test(firstArg)
      ? firstArg
      : undefined;
  const value = Number(flag?.split("=")[1] ?? positional ?? fallback);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`);
  return value;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("turn server did not bind a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

async function runVariant(opts: {
  variant: Variant;
  turns: number;
  baseUrl: string;
  seenTokens: Array<{ token: string; path: string; at: number }>;
}): Promise<TurnResult[]> {
  const results: TurnResult[] = [];
  let previousBRoot: string | undefined;
  for (let index = 0; index < opts.turns; index += 1) {
    const agent: Agent = index % 2 === 0 ? "A" : "B";
    const text =
      opts.variant === "materialized" && index === 0
        ? "Read agent B's workspace secret. REQUEST-A-0"
        : `REQUEST-${agent}-${index}`;
    const result = await fireTurn({
      baseUrl: opts.baseUrl,
      prefix: PREFIXES[opts.variant][agent],
      agent,
      conversationId: `${opts.variant}-${agent.toLowerCase()}`,
      text,
      token: TOKENS[agent],
      seenTokens: opts.seenTokens,
      priorRoot: agent === "A" ? previousBRoot : undefined,
    });
    results.push(result);
    if (agent === "B") previousBRoot = result.root;
  }
  return results;
}

async function main(): Promise<void> {
  const turns = numericArg("turns", 20);
  const filler = numericArg("filler", 50);
  const delay = numericArg("delay", 40);
  const echo = await startEchoProvider({
    firstByteDelayMs: delay,
    rejectedTokens: ["sk-agent-a-bad"],
  });
  let server: Server | undefined;
  try {
    const objectSync = await import("@houston/runtime-client/object-sync");
    const storeRoot = join(scratch, "store");
    const useGcs = process.argv.includes("--gcs");
    const store: ObjectStore = useGcs
      ? new (await import("../src/turn/gcs-store")).GcsStore(
          process.env.HOUSTON_GCS_BUCKET || "",
        )
      : new objectSync.LocalDirStore(storeRoot);
    await seedVariant(
      store,
      join(scratch, "seed"),
      echo.url,
      "materialized",
      filler,
    );
    await seedVariant(store, join(scratch, "seed"), echo.url, "empty", 0);
    const { createTurnServer } = await import("../src/turn/server");
    server = createTurnServer({ store, token: "" });
    const baseUrl = await listen(server);
    const bootToListenMs = performance.now();
    const materialized = await runVariant({
      variant: "materialized",
      turns,
      baseUrl,
      seenTokens: echo.seenTokens,
    });
    const empty = await runVariant({
      variant: "empty",
      turns,
      baseUrl,
      seenTokens: echo.seenTokens,
    });
    const authFinding = await probeAuthFailureLeak({
      baseUrl,
      seenTokens: echo.seenTokens,
    });
    printReport("Materialized workspace", materialized, bootToListenMs);
    printReport("Hydrate-free workspace", empty, bootToListenMs);
    const stored = await checkStoredIsolation(store, scratch);
    const checks = {
      "credential isolation": [...materialized, ...empty].every(
        (result) =>
          result.tokens.length === 1 &&
          result.tokens[0] === TOKENS[result.agent],
      ),
      "store isolation": stored.isolated,
      "no persisted auth.json": stored.noAuth,
      "workspace clamp / prior tmpdir removed": [
        ...materialized,
        ...empty,
      ].every((result) => result.priorRootGone && !existsSync(result.root)),
      "environment pure before runtime boot": runtimeEnvPure,
      "timings precede terminal": [...materialized, ...empty].every(
        (result) => {
          const types = result.frames.map((frame) => frame.type);
          return (
            types.at(-2) === "timings" &&
            ["done", "error"].includes(types.at(-1) || "")
          );
        },
      ),
    };
    console.log("\n=== Isolation assertions ===");
    for (const [name, passed] of Object.entries(checks))
      console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
    console.log(
      `${authFinding} auth-failure map cross-agent scope (non-fatal)`,
    );
    if (scrubbedProviderEnv.length)
      console.log(
        `PASS scrubbed ${scrubbedProviderEnv.length} ambient provider key(s) before runtime import`,
      );
    if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
  } finally {
    if (server) await closeServer(server);
    await echo.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
