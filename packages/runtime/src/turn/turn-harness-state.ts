import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** Provider harnesses whose native session histories cannot be interleaved. */
export type TurnHarness = "claude" | "pi";

export function turnHarnessFile(
  dataDir: string,
  conversationId: string,
): string {
  return join(dataDir, "sessions", conversationId, "harness.json");
}

export function readTurnHarness(
  dataDir: string,
  conversationId: string,
): TurnHarness | undefined {
  const file = turnHarnessFile(dataDir, conversationId);
  if (!existsSync(file)) return undefined;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    backend?: unknown;
  };
  if (parsed.backend === "claude" || parsed.backend === "pi")
    return parsed.backend;
  throw new Error(`Invalid pooled-turn harness marker: ${file}`);
}

export function writeTurnHarness(
  dataDir: string,
  conversationId: string,
  backend: TurnHarness,
): void {
  const file = turnHarnessFile(dataDir, conversationId);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ backend }), { mode: 0o600 });
  renameSync(tmp, file);
}
