/**
 * pi's REAL model catalog per provider (captured from `getModels(...)`), the set
 * a stored model id is checked against before a migration keeps it.
 *
 * Providers with finite catalogs are enumerated: `getModel` returns undefined
 * for an unlisted id on these, so a stored model MUST be checked against this
 * set. Providers whose catalogs move too often for this domain table are left
 * absent on purpose and their stored model passes through untouched — the
 * runtime's read-time `safeGetModel` guard is the backstop for stale ids.
 * openai-compatible has no catalog at all, and github-copilot is left open here
 * because its dotted ids change with the gateway.
 *
 * A dependency-free LEAF (see `provider-dialect.ts`).
 */

import type { ProviderId } from "./provider-ids";

export const VALID_MODELS: Partial<Record<ProviderId, ReadonlySet<string>>> = {
  anthropic: new Set([
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-fable-5",
    "claude-fable-5-1",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-0",
    "claude-opus-4-1",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-opus-4-5",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-sonnet-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
  ]),
  // pi's Codex catalog MINUS the rows OpenAI refuses a ChatGPT subscription:
  // gpt-5.5 answers `404 model_not_found` and gpt-5.4 answers `400 not
  // supported when using Codex with a ChatGPT account` (probed live against
  // the responses endpoint — packages/runtime/src/ai/codex-offered.ts holds the
  // method and the verdicts). Keeping them "valid" is what let a stored id
  // survive migration into a turn that could only fail.
  "openai-codex": new Set([
    "gpt-5.3-codex-spark",
    "gpt-5.4-mini",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
  ]),
  // `MiniMax-M3[1m]` is the token/coding-plan SKU: hand-built on the minimax
  // provider (not in pi's catalog), so it must be a VALID id here or the migration
  // rewrites it to bare `MiniMax-M3` (HOU-1160).
  minimax: new Set([
    "MiniMax-M3[1m]",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M3",
  ]),
  deepseek: new Set(["deepseek-v4-flash", "deepseek-v4-pro"]),
};
