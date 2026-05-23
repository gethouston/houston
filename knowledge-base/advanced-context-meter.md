# Advanced: Context meter

Surfaced by the `advanced.context_meter` flag in Settings → Advanced.

## What it does

Adds a small token-usage wheel to the chat composer toolbar, sitting next to the model selector. The wheel shows how much of the active model's context window the current session has consumed. Clicking opens a popover with the full breakdown.

## How it works

### Where the number comes from

Two sources, in priority order:

1. **Authoritative** — the latest `FeedItem::FinalResult.input_tokens` for the active session. That's the value the provider reported in its last turn-complete envelope. Anthropic (Claude) emits this in the `result` event's `usage` block; gemini emits it in stats; codex emits it via `turn.completed`.
2. **Estimated** — when no `FinalResult` carries token data yet (e.g. the user hasn't sent the first turn), the meter falls back to a chars/4 heuristic summed over all feed items.

The popover labels the per-category breakdown as estimated regardless — only the meter total is provider-reported when available.

### Where the limit comes from

`app/src/lib/model-limits.ts::MODEL_CONTEXT_LIMITS` — a hard-coded table keyed by `provider → model → tokens`. Unknown combinations fall through to `FALLBACK_CONTEXT_LIMIT` (200K). When Houston starts exposing the Anthropic `[1m]` context variants, add `sonnet-1m` / `opus-1m` entries here.

### Color thresholds

- `< 70%` neutral (theme primary)
- `70% – 90%` yellow
- `≥ 90%` red

Set in `<ContextMeter />` and mirrored in the popover progress bar.

### Popover contents

Three blocks:

1. **Header** — title, `used / max` (e.g. `34.5k / 200.0k`), model name, threshold-colored progress bar.
2. **Breakdown** — token estimates per feed-item category: Free space, Your messages, Assistant messages, Thinking, Tool calls, Tool results, System. Rows with zero tokens are hidden. Sorted by token count descending (except Free which is always first).
3. **Other metrics** — Turn count (FinalResult count), total session time (sum of `duration_ms`), total cost (sum of `cost_usd`, Claude only), cache hit rate (`cache_read_input_tokens / input_tokens` from latest FinalResult), tool call count, file change count.

## Why it's gated

Token counts are developer information. Non-technical users don't need them, and a "context filling up" red badge on every chat would be confusing. Default-off, opt-in for power users who actually care.

## Enforcement surface

`enforcementSurface: "ui"`. The engine populates token fields in `FeedItem::FinalResult` and persists them regardless of the flag — Houston Cloud / Always On consumers can read them straight from the chat feed.

## Implementation pointers

- Flag entry: `app/src/lib/featureFlags.ts::FLAG_REGISTRY["advanced.context_meter"]`
- Stats hook: `app/src/hooks/use-context-stats.ts` (chars/4 heuristic + FinalResult parse)
- Wheel component: `app/src/components/context-meter.tsx`
- Popover component: `app/src/components/context-meter-popover.tsx`
- Mount site: `app/src/components/tabs/chat-tab.tsx` (footer slot next to `<ChatModelSelector>`)
- Model limits: `app/src/lib/model-limits.ts`
- Engine substrate: `engine/houston-terminal-manager/src/types.rs::UsageInfo` + `FeedItem::FinalResult` token fields, populated by all three parsers (`parser.rs`, `codex_parser.rs`, `gemini_parser_state.rs`)

## Provider parity

| Provider | input_tokens | output_tokens | cache_read | cache_creation | cost_usd |
|---|:---:|:---:|:---:|:---:|:---:|
| Anthropic (Claude) | ✓ | ✓ | ✓ | ✓ | ✓ |
| OpenAI (Codex) | ✓ | ✓ | ✓ (`cached_input_tokens`) | ✗ | ✗ |
| Google (Gemini) | ✓ | ✓ | ✓ (`cached`) | ✗ | ✗ |

Codex and gemini don't emit cost; the metrics row shows `—` for cost on those sessions. Anthropic prompt caching only fires when caching is active for the request.

## See also

- `knowledge-base/feature-flags.md` — the 12 rules + adding-a-flag procedure
- `knowledge-base/advanced-worktrees.md` — sibling advanced flag (Phase 1)
- RFC: `gethouston/houston#248` — umbrella RFC for the advanced settings wave (this was the "cost display" entry, recast as context meter since the actionable metric is tokens, not $)
