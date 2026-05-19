# Stack Recommender — Composio toolkits from plain-language intent

Lives in `engine/houston-composio/src/recommender/`. End user types a goal in
their own words; engine returns a curated stack of 2-6 Composio toolkits
(with logos, role, reason, alternatives). Two surfaces in the desktop app:

- Connections tab → `StackDiscoverPanel` (`app/src/components/tabs/stack-discover-panel.tsx`)
- New-agent modal → `StoreStepDiscover` (`app/src/components/shell/store-step-discover.tsx`)

Both call `composioRecommendStack()` (`ui/engine-client/src/client.ts`)
which hits `POST /v1/composio/recommend`. Rust route in
`engine/houston-engine-server/src/routes/composio.rs`.

## Problem it solves

Composio exposes 1000+ integrations. Non-technical user knows maybe 10.
Without help they can't build an agent because they don't know what to
connect. Stack recommender turns "I want X" into a concrete pick.

## Pipeline (V1.6 — reasoning-first)

Single LLM round-trip per request. No retrieval-first stage in the happy
path. The LLM is the brain; embeddings only assist when the LLM names a
slug we don't have.

```
intent (string, any of en/es/pt)
   ↓
llm_pick::decompose_and_pick()
   ↓  one CLI call to `claude -p --model haiku`
   ↓
DecomposeResponse {
  subtasks: [ { description, suggestedSlugs[], role, reason }, ... ],
  missingCapabilities: [ ... ]
}
   ↓
for each subtask:
  for each slug in suggestedSlugs:
    if is_banned_app(slug)  → skip
    if catalog::find(slug)  → pick it (slug normalization: hacker-news → hackernews)
  if nothing picked:
    embedding fallback (cosine ≥ 0.65 or skip)
  if still nothing:
    push to missingCapabilities
   ↓
RecommendResult { primaryStack[], alternatives{}, missingCapabilities[], llmPicked: true, debug{} }
```

### Why reasoning-first beats retrieval-first

Retrieval-first (V1.5, kept as fallback only): embed the intent, take
top-K by cosine, hand the candidate JSON to the LLM, ask it to filter.
This drops 30-50% of relevant tools on abstract intents — if cosine
doesn't surface GitHub for "review my code", the LLM can't pick it.

Reasoning-first (V1.6): the LLM already knows the software landscape.
Ask it directly. It can name `github`, `trello`, `tavily`, `firecrawl`
without any retrieval. Embeddings only kick in when the LLM hallucinates
a slug.

The retrieval-first path lives in `retrieval_fallback()` and runs only
when the reasoning LLM call fails entirely (CLI missing, timeout, parse
error).

## Key design decisions

| Decision | Why |
|---|---|
| **Reasoning-first, embedding as fallback** | LLM world knowledge > retrieval over a tiny enriched catalog. |
| **Ban list in code, not only prompt** | LLM ignores negative instructions. `is_banned_app()` in `banlist.rs` enforces it. |
| **Ban list covers orchestrators + LLM APIs** | Make/Zapier/n8n duplicate Houston routines. OpenAI/Anthropic/Gemini duplicate the host LLM. |
| **Slug normalization** | LLM emits `hacker-news`; catalog has `hackernews`. `catalog::find` strips `-_. ` and tries again. |
| **Embedding threshold 0.65** | At 0.45 we got `hunter` (email finder) recommended for "product discovery" because the LLM suggested `producthunt` (not in catalog). High threshold + honest missing capability > weak match that misleads. |
| **`missingCapabilities` over weak match** | Telling the user "Composio doesn't have ProductHunt" is honest. Substituting a different product is misleading. |
| **One LLM call, no chain** | Latency matters. 20-50s per request is already at the edge of acceptable. |
| **Sub-task decomposition is explicit** | Multi-objective intents ("do X AND Y AND Z") must cover every objective. STEP 1B in prompt forces split for complementary sources. |
| **24h LRU cache** | Same intent + connected slugs = same answer. Cache hit is free. |
| **In-app debug payload** | `RecommendDebug` ships in every response. Inspect from browser network tab — no need for engine log access. |

## Files

| File | Role |
|---|---|
| `mod.rs` | Public `recommend()` entry. Orchestrates decompose → resolve → fallback. |
| `llm_pick.rs` | LLM calls. `decompose_and_pick` (V1.6 primary). `pick` (V1.5 retrieval fallback). |
| `banlist.rs` | `is_banned_app()` — hardcoded slugs we never recommend. |
| `catalog.rs` | Loads `data/catalog-enriched.json` via `include_str!`. `find()` with slug normalization. |
| `matcher.rs` | Tokenize + score keyword matches. Used only by V1.5 retrieval fallback. |
| `embeddings.rs` | fastembed-rs wrapper (MultilingualE5Small, 384-dim). `embed_query`, `cosine`. |
| `embedding_store.rs` | HEMB binary format (magic + version + dim + count + entries). `from_bundled()` reads `data/catalog-embeddings.bin` via `include_bytes!`. |
| `cache.rs` | 24h LRU keyed by `(normalized_intent, sorted_connected_slugs)`. |
| `types.rs` | Wire types. `EnrichedToolkit`, `StackEntry`, `RecommendResult`, `RecommendDebug`. |
| `bin/precompute_embeddings.rs` | Dev-side CLI. Reads catalog JSON, embeds toolkits, writes `data/catalog-embeddings.bin`. |

## Data files (`engine/houston-composio/data/`)

Both bundled into the engine binary at build time.

- `catalog-enriched.json` (~1.5 MB) — 1000 toolkits, each with multi-language
  `oneLiner` / `useCases` / `keywords` (en + es + pt), `typicalCombos`,
  `alternatives`, `primaryCategory`. Generated by
  `scripts/enrich-composio-catalog.mjs` (Anthropic or Gemini, ~$0.10 with
  gemini-3.1-flash-lite).
- `catalog-embeddings.bin` (~1.5 MB) — 1000 × 384 float vectors, MultilingualE5Small
  passages of `{name} | {oneLiner} | {useCases}`. Regenerated by
  `cargo run --bin precompute_embeddings`.

When the catalog changes you MUST re-run precompute_embeddings before
shipping or runtime cosine matches will be off.

## Ban list (`banlist.rs`)

Two categories, hardcoded for guarantees:

**Orchestrators** — duplicate Houston's native scheduling/routines:
`make`, `make_com`, `zapier`, `n8n`, `workato`, `pipedream`, `ifttt`,
`integromat`, `automatisch`, `kit`, `promptmate`, `promptmate_io`.

**LLM API providers** — the host IS the LLM:
`openai`, `anthropic`, `gemini`, `google_ai`, `googleai`, `cohere`,
`mistral_ai`, `mistralai`, `togetherai`, `together_ai`, `groq`, `replicate`.

Enforced at three points:
1. `decompose_and_pick` prompt asks the LLM not to suggest these.
2. `recommend()` filters suggested_slugs through `is_banned_app`.
3. `llm_pick::materialize()` (retrieval fallback) does the same.

The prompt-only rule is not enough — older runs showed the LLM picking
Promptmate or Kit despite explicit prohibition.

## Prompt structure (`build_decompose_prompt`)

The prompt instructs the LLM in 6 steps:

1. **Decompose** the goal into independent sub-tasks.
2. **Split multi-source** sub-tasks (e.g. discovery from 3 communities → 3 sub-tasks).
3. **Suggest 2-4 slugs per sub-task** in priority order (slot 1 = primary, rest = fallbacks for the same role).
4. **Prefer already-connected apps** when equivalent.
5. **NEVER suggest banned apps** (orchestrators + LLM APIs).
6. **`missingCapabilities`** for sub-tasks with no good tool.

Plus an example showing the multi-source split for the "Trello from new
dev tools" intent.

The prompt is the highest-leverage knob in the system. When the
recommender misbehaves, almost always the fix is in the prompt.

## Output (`RecommendResult`)

```json
{
  "primaryStack": [
    { "toolkit": "github", "name": "GitHub", "role": "...", "reason": "...", "connected": false, "logoUrl": "..." },
    ...
  ],
  "alternatives": { "tavily": ["firecrawl", "exa"], ... },
  "missingCapabilities": ["plain language phrase", ...],
  "llmPicked": true,
  "debug": {
    "catalogSize": 1000,
    "embeddingsLoaded": 1000,
    "intentEmbedded": false,
    "embedMs": 0,
    "topCandidateSlugs": [ ... ],
    "llmPickMs": 27553,
    "llmPickError": null
  }
}
```

`llmPicked: false` only when the LLM call failed and we fell through to
`fallback_from_candidates()` (deterministic top-K).

`debug` is always populated. Frontends can choose to hide or show it.

## Failure modes (in order)

| What | Symptom | Fallback |
|---|---|---|
| LLM CLI not installed | spawn fails | retrieval_fallback → keyword top-K + deterministic stack |
| LLM call times out (>90s) | error: "process timed out" | retrieval_fallback |
| LLM JSON parse fails | error: "invalid JSON: ..." | retrieval_fallback |
| `subtasks` returned empty | (degenerate decompose) | retrieval_fallback |
| All suggested slugs are banned/missing for a sub-task | sub-task → `missingCapabilities` | (still returns the resolved sub-tasks) |
| Catalog is empty | 503 `RecommendError::CatalogEmpty` | none — surface the error |
| Empty intent | 400 `RecommendError::EmptyIntent` | none — surface the error |

## How to extend

**Add a banned app**: edit `banlist.rs::is_banned_app` + add a test case.
Recompile engine. The prompt also lists banned categories — update the
STEP 4 block in `build_decompose_prompt` so the LLM doesn't waste tokens
suggesting it.

**Add slugs to the prompt's capability list**: edit STEP 2 of
`build_decompose_prompt` (`llm_pick.rs`). The list is hints, not
authoritative — the LLM will name slugs from world knowledge for things
not in the list. But adding common ones reduces hallucination.

**Re-enrich catalog**: run
`node scripts/enrich-composio-catalog.mjs --api-key=$GEMINI_API_KEY`.
Resumable; existing entries skipped unless `--force`. Then:
`cargo run --bin precompute_embeddings` to regenerate the embeddings bin.

**Change embedding model**: edit `embeddings.rs` (currently
`MultilingualE5Small`, 384-dim). `EMBEDDING_DIM` must match. Rerun
precompute. The HEMB binary format header (`embedding_store.rs`) carries
the dim — mismatch is rejected with a clear error.

**Adjust embedding threshold**: `EMBEDDING_FALLBACK_MIN_COSINE` in
`mod.rs`. 0.65 is the current floor. Lower → more recoveries but more
wrong matches. Higher → more `missingCapabilities`.

## Testing

- `cargo test -p houston-composio` — 36 tests cover banlist, slug
  normalization, embedding store roundtrip, matcher tokenization, cache
  key normalization, decompose-response parsing, hallucinated-slug
  rejection.
- The recommend pipeline end-to-end is not unit-tested because it
  requires the user's LLM CLI. Validate by hand with `pnpm tauri dev`
  and the in-app surfaces.

## Future work (not in this PR)

- **"Create custom agent with this stack" button** — convert the stack
  into a real agent: skip the Store, auto-connect integrations, generate
  CLAUDE.md + skills + routine via LLM.
- **Latency optimization** — 20-50s per request. Possible: streaming
  output, smaller model, shorter prompt, system prompt caching.
- **Surface `missingCapabilities` in UI** — currently the field is
  returned but the panels don't render it. Should be a soft callout
  ("we don't have a tool for X — let us know if you need one").
