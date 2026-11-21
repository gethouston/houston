import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import type { ProviderUsageTokens, TokenUsage } from "@houston/runtime-client";
import { config } from "../../config";

const LEDGER_FILE = "token-usage.json";

interface Ledger {
  version: 1;
  providers: Record<string, ProviderUsageTokens>;
}

const empty = (): Ledger => ({ version: 1, providers: {} });

function ledgerPath(dataDir: string): string {
  return join(dataDir, LEDGER_FILE);
}

function readLedger(dataDir: string): Ledger {
  let raw: string;
  try {
    raw = readFileSync(ledgerPath(dataDir), "utf8");
  } catch {
    return empty();
  }
  let parsed: Ledger | null;
  try {
    parsed = JSON.parse(raw) as Ledger | null;
  } catch {
    return empty();
  }
  if (parsed?.version !== 1 || typeof parsed.providers !== "object")
    return empty();
  return parsed;
}

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
    const tmp = atomicTempPath(path);
    writeFileSync(tmp, JSON.stringify(ledger, null, 2), "utf8");
    renameSync(tmp, path);
  } catch (err) {
    console.error(
      `[usage-ledger] failed to record spend for ${provider}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

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
