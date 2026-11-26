/**
 * The ONE stored-model rename ladder (`canonicalModelId`), split out of
 * `./provider-model.ts` as a dependency-free LEAF (see `provider-dialect.ts`)
 * exposed as the `@houston/domain/canonical-model-id` subpath. The host's
 * catalog and the runtime read it there, so neither loads the package barrel,
 * which imports the `.houston` JSON schemas that a plain Node ESM loader (the
 * fake host under Playwright) refuses without an import attribute.
 */

import { legacyModelAlias } from "@houston/domain/model-aliases";
import { VALID_MODELS } from "@houston/domain/provider-valid-models";
import type { ProviderId } from "./provider-ids";

/**
 * Resolve a stored model id for `provider`: a valid id passes through, a known
 * legacy alias maps at the same tier (on `anthropic`, a retired Claude id maps
 * to its own family's lineup model), an open-catalog gateway keeps anything
 * else verbatim, and a finite-catalog provider answers null for anything else.
 * Same single-ladder contract as `canonicalProviderId` — callers pick their own
 * fallback.
 *
 * The alias table is consulted for an open-catalog gateway TOO. Pass-through is
 * what lets a gateway route a model pi never baked, but a row pi DROPPED
 * (opencode's `mimo-v2.5-free`, opencode-go's `glm-5.1`) has no model object
 * left to build a turn on, so passing it through is a pin that fails on every
 * fire. There is no valid-set to check the alias against — the gateway's live
 * catalog is the only authority — so the mapped id stands on the table's own
 * same-tier rule.
 */
export function canonicalModelId(
  provider: ProviderId,
  raw: string,
): string | null {
  // `hasOwn` so a stored id of `constructor` never reads a prototype member.
  const valid = Object.hasOwn(VALID_MODELS, provider)
    ? VALID_MODELS[provider]
    : undefined;
  const alias = legacyModelAlias(provider, raw);
  if (!valid) return alias ?? raw;
  if (valid.has(raw)) return raw;
  return alias && valid.has(alias) ? alias : null;
}
