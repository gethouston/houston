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
  // A corrupt marker (partial sync, prior crash) must degrade to "unknown" —
  // the conversation then takes the pre-marker resume path — never fail the
  // turn. Logged so the corruption is visible to us.
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      backend?: unknown;
    };
    if (parsed.backend === "claude" || parsed.backend === "pi")
      return parsed.backend;
    throw new Error(`unrecognized backend ${String(parsed.backend)}`);
  } catch (error) {
    console.error(
      `[turn] harness marker unreadable, treating as unknown (${file}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
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
