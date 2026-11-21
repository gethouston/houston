# app/src/lib/provider-overrides: design decisions

Covers `app/src/lib/provider-overrides/`: Houston's presentation overrides on the pi-ai provider catalog. File paths in this record are relative to `app/src/`.

## pi-ai owns the runnable set; overrides are presentation only

Providers, models, windows, thinking levels and pricing come from pi-ai through `/v1/catalog`. Houston's overrides add labels, descriptions, cost lines and key pages. Dropping or hiding a provider or model is presentation only; legacy conversations still run.

Lives in `lib/provider-overrides/overrides.ts`, `lib/provider-overrides/types.ts`, `lib/provider-overrides/pi-catalog-filters.ts`.

## The `openai` collision

pi's direct API-key `openai` provider collides with the `openai-codex` to `openai` display rename, so it is dropped before the rename.

Lives in `lib/provider-overrides/pi-catalog-filters.ts`, `lib/provider-overrides/dialect.ts`.

## Curated visible model sets

A provider with an entry surfaces only those ids. OpenAI hides pi's 2023-era gpt-4 rows. Codex shows only what OpenAI's backend serves a ChatGPT subscription (`codexOfferedModelIds` in `packages/runtime`). Anthropic shows one model per family from `ANTHROPIC_LINEUP`. MiniMax hides retired rows the host keeps. Moonshot retired the kimi-k2 preview series. OpenRouter's rolling `~vendor/...-latest` aliases duplicate concrete models and are hidden.

Lives in `lib/provider-overrides/pi-catalog-filters.ts`.

## Effort override is an escape hatch

Effort levels derive from pi's thinking levels; an override exists only for a real gateway cap the derivation cannot see.

Lives in `lib/provider-overrides/types.ts`, `lib/provider-overrides/overrides-api-key-curated.ts`.

## Vendor key quirks

NVIDIA needs an NGC Personal Key, not the quick key flow. Alibaba's Qwen token bundles accept only the dedicated key, and the individual tier has its own key and seat. The MiniMax M Plan key is separate from a pay-as-you-go key. Vercel's key link is the deep link its own 401 remedy points at. Azure's base URL is per resource, so its connect dialog collects an endpoint.

Lives in `lib/provider-overrides/overrides-api-key.ts`, `lib/provider-overrides/overrides-api-key-curated.ts`, `lib/provider-overrides/connect-surfaces.ts`.

## Free tiers

Some API-key entries exist only so the cost line can say the user can start at no cost.

Lives in `lib/provider-overrides/overrides-api-key.ts`.

## One Copilot card

Connecting opens a Personal or Enterprise dialog; both drive the single `github-copilot` provider.

Lives in `lib/provider-overrides/overrides-subscription.ts`.

## Local provider

The local OpenAI-compatible provider has no pi catalog of its own and is appended.

Lives in `lib/provider-overrides/local-provider.ts`.

## Qwen extension provider

It is not a pi builtin; the host appends it to `/v1/catalog`.

Lives in `lib/provider-overrides/overrides-api-key.ts`.
