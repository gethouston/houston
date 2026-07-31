/** `.houston/config/config.json` — per-agent provider/model config. */

import schema from "@houston-ai/agent-schemas/config.schema.json";
import { readAgentJson, writeAgentJson } from "./agent-file";

export interface Config {
  name?: string;
  // A pi provider id (`anthropic`, `openai-codex`, `opencode`, …). Open string:
  // the catalog is ~35 providers and drifts (see protocol `ProviderId`).
  provider?: string;
  model?: string;
  // The active vocabulary is `low|medium|high|xhigh`; a legacy `"max"` may still
  // sit in older on-disk configs. It is tolerated on read and normalized to
  // `xhigh` at the UI boundary (see `normalizeEffort`), so it stays here.
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Legacy/portable config field retained for on-disk compatibility. The app
   * does not read or write it; the session-local composer mode rides each send
   * as `modeOverride` and defaults to `execute` for a new mission.
   */
  mode?: "execute" | "plan" | "auto";
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
