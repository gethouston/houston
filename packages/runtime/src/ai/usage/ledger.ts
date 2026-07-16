import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProviderUsageTokens, TokenUsage } from "@houston/runtime-client";
import { config } from "../../config";

/**
 * Local token-spend ledger — the usage surface for API-key providers with no
 * account-usage API to probe (Gemini, Bedrock, OpenCode, MiniMax, custom
 * endpoints). The long-lived runtime records every turn's `TokenUsage` here
 * keyed by provider id; `GET /providers/usage` serves the accumulated totals
 * where it would otherwise report `unsupported`.
 *
 * Semantics: `inputTokens` sums each request's FULL prompt (`context_tokens`,
 * cache-inclusive) — that is what the provider processes and bills as input on
 * every request — and `outputTokens` sums generated tokens. So the totals are
 * "tokens the provider was sent/produced", not "distinct conversation tokens".
 *
 * One JSON file under the runtime's data dir, rewritten atomically
 * (tmp + rename) on each turn — the same durability story as the settings
 * store. The per-turn cloud runtime never records here: its data dir is a
 * per-request throwaway, so a ledger there would evaporate with the turn.
 */

const LEDGER_FILE = "token-usage.json";

interface Ledger {
  version: 1;
  providers: Record<string, ProviderUsageTokens>;
}

// Always a FRESH object: callers mutate the returned ledger in place, so a
// shared constant here would leak spend across reads (and across tests).
const empty = (): Ledger => ({ version: 1, providers: {} });

function ledgerPath(dataDir: string): string {
  return join(dataDir, LEDGER_FILE);
}

function readLedger(dataDir: string): Ledger {
  let raw: string;
  try {
    raw = readFileSync(ledgerPath(dataDir), "utf8");
  } catch {
    return empty(); // no ledger yet — nothing metered on this install
  }
  let parsed: Ledger | null;
  try {
    parsed = JSON.parse(raw) as Ledger | null;
  } catch {
    return empty(); // corrupt ledger — start fresh rather than wedge accounting
  }
  if (parsed?.version !== 1 || typeof parsed.providers !== "object")
    return empty();
  return parsed;
}

/**
 * Fold one finished turn's usage into the provider's running totals. Called
 * after every turn (all providers — recording is cheap and uniform; the read
 * side decides which providers surface it). A ledger failure must never fail
 * the turn it accounts for, and there is no UI thread here to toast on, so a
 * broken write logs and moves on (the sanctioned event-callback exception).
 */
export function recordTokenSpend(
  provider: string,
  usage: TokenUsage,
  dataDir: string = config.dataDir,
  now: () => Date = () => new Date(),
): void {
  try {
    const ledger = readLedger(dataDir);
    const prior = ledger.providers[provider];
    ledger.providers[provider] = {
      inputTokens: (prior?.inputTokens ?? 0) + usage.context_tokens,
      outputTokens: (prior?.outputTokens ?? 0) + usage.output_tokens,
      turns: (prior?.turns ?? 0) + 1,
      since: prior?.since ?? now().toISOString(),
    };
    const path = ledgerPath(dataDir);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(ledger, null, 2), "utf8");
    renameSync(tmp, path);
  } catch (err) {
    console.error(
      `[usage-ledger] failed to record spend for ${provider}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * The provider's accumulated totals, or null when nothing was ever metered
 * (the usage row then stays honestly `unsupported`). A corrupt ledger reads
 * as null rather than throwing — the usage probe must never 500 over a bad
 * accounting file.
 */
export function readTokenSpend(
  provider: string,
  dataDir: string = config.dataDir,
): ProviderUsageTokens | null {
  try {
    const row = readLedger(dataDir).providers[provider];
    if (!row) return null;
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
    return {
      inputTokens: num(row.inputTokens),
      outputTokens: num(row.outputTokens),
      turns: num(row.turns),
      since: typeof row.since === "string" ? row.since : "",
    };
  } catch (err) {
    console.error(
      `[usage-ledger] failed to read spend for ${provider}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
