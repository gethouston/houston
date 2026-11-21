# app/src/lib/providers: design decisions

Covers `app/src/lib/providers/`: the client provider table built from the host catalog, lookups and visibility. File paths in this record are relative to `app/src/`.

## `PROVIDERS` is a mutable array with a stable reference

It starts as the override-only seed and is rebuilt in place from the host's catalog. An empty catalog means a broken host, not zero providers, so it never rebuilds from `[]`.

Lives in `lib/providers/catalog.ts`.

## Regional duplicates hide

`-cn`, `-sgp` and `-ams` deployments hide when the standard deployment ships.

Lives in `lib/providers/catalog.ts`.

## Self-contained subpath imports

The node:test runner cannot load the barrels, so these modules import dialect, default-model and alias tables through self-contained subpaths.

Lives in `lib/providers/build-provider.ts`, `lib/providers/lookup.ts`, `lib/providers/model-values.ts`, `lib/providers/runs-as.ts`, `lib/providers/brand-aliases.ts`.

## Effort levels

pi's `off` and `minimal` are dropped because Houston's scale starts at `low`. A persisted `max` resolves to `xhigh`. The gauge always renders the full ascending vocabulary.

Lives in `lib/providers/build-provider.ts`, `lib/providers/model-values.ts`, `lib/providers/types.ts`.

## One row per picker identity

Entries folding to the same picker identity within a provider collapse to one row.

Lives in `lib/providers/build-provider.ts`.

## Shared tables

Default models come from `@houston/domain` `provider-default-models.ts`, model names from shared vocabulary, window sizing from the shared `@houston/protocol` table keyed by pi's pre-rename ids.

Lives in `lib/providers/build-provider.ts`.

## Hidden but runnable rows

Rows curation hides still run for a chat, agent or routine already pinned to them.

Lives in `lib/providers/build-provider.ts`, `lib/providers/types.ts`.

## Context window estimate

The default window is a starting denominator because the real window is plan gated and not reported; it snaps up to a ceiling when usage exceeds it.

Lives in `lib/providers/types.ts`.

## Lookups accept either dialect

`PROVIDERS` is keyed by display id; lookups resolve canonical ids too.

Lives in `lib/providers/lookup.ts`.

## Open catalogs

Some providers' hydrated models are the picker set, not everything the gateway can route, so a picked model is never nulled against them.

Lives in `lib/providers/lookup.ts`, `lib/providers/model-values.ts`.

## `runsAs`

A retired catalog row names the model it runs as, which the allowed-models ceiling uses.

Lives in `lib/providers/runs-as.ts`.

## OpenCode

Zen and Go authenticate with the same opencode.ai key, so connect surfaces show one card for both gateways while the picker keeps both.

Lives in `lib/providers/visibility.ts`.

## Visibility source

`/v1/catalog` is the single visibility source. The local provider shows when the host's `openaiCompatible` capability says so.

Lives in `lib/providers/visibility.ts`.
