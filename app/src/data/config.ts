/** `.houston/config/config.json` — per-agent provider/model config. */

import schema from "@houston-ai/agent-schemas/config.schema.json";
import { readAgentJson, writeAgentJson } from "./agent-file";

export interface Config {
  name?: string;
  provider?: "anthropic" | "openai";
  model?: string;
  // The active vocabulary is `low|medium|high|xhigh`; a legacy `"max"` may still
  // sit in older on-disk configs. It is tolerated on read and normalized to
  // `xhigh` at the UI boundary (see `normalizeEffort`), so it stays here.
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Composer "Mode" selector memory ONLY: the last mode the user picked for this
   * agent, so the pill reopens where they left it. Per-agent, local. It is NEVER
   * synced to engine Settings — the actual plan/execute pin rides each send as
   * `modeOverride` (an unpinned turn is `execute`). Unknown values normalize to
   * `execute` at the UI boundary (see `normalizeTurnMode`).
   */
  mode?: "execute" | "plan";
  [extra: string]: unknown;
}

const NAME = "config";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

export async function read(agentPath: string): Promise<Config> {
  return readAgentJson<Config>(agentPath, NAME, s, {});
}

export async function write(
  agentPath: string,
  config: Config,
  opts?: import("../lib/agent-warming-guard").WarmingWriteOptions,
): Promise<void> {
  await writeAgentJson(agentPath, NAME, s, config, opts);
}
