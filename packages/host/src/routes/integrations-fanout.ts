import { curatedCanonicalScope } from "../integrations/custom/curated";
import { CUSTOM_ACTION_PREFIX } from "../integrations/custom/provider";
import type { ActingContext } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import {
  type ActionResult,
  IntegrationSigninRequiredError,
  type ToolMatch,
} from "../integrations/types";

/** Resolve the provider that owns an action when callers omit one. */
export function providerForAction(
  registry: IntegrationRegistry,
  action: string,
): string {
  const ids = registry.ids();
  if (action.startsWith(CUSTOM_ACTION_PREFIX) && ids.includes("custom")) {
    return "custom";
  }
  return ids.find((id) => id !== "custom") ?? ids[0] ?? "custom";
}

/** Inputs for a provider-fan-out integration search. */
export interface IntegrationSearchInput {
  registry: IntegrationRegistry;
  userId: string;
  query: string;
  acting?: ActingContext;
  app?: string;
  provider?: string;
  fatalFailure?: (error: unknown) => boolean;
}

/** Merged integration search results and scope-fallback signals. */
export interface IntegrationSearchOutput {
  items: ToolMatch[];
  unscopedFallback?: true;
  scopeIgnored?: true;
}

/** Search selected providers and preserve healthy results across partial failure. */
export async function searchIntegrations(
  input: IntegrationSearchInput,
): Promise<IntegrationSearchOutput> {
  const providerIds = input.provider ? [input.provider] : input.registry.ids();
  // A curated app that another provider also carries (HighLevel is in
  // Composio's catalog too) is one app to the user — one connect card, with
  // that provider's connect leading. The custom provider's bare "connect
  // me" row for it (no action, not connected) is then a duplicate offer and
  // is dropped; its compiled tools and every other provider's rows stay.
  // A curated alias ("leadconnector") names a slug other providers may
  // carry under the real name only; they get the canonical slug, while the
  // custom provider keeps the raw scope and ranks its own exact matches
  // first (custom/search.ts).
  const fanOut = async (scope: string | undefined) => {
    const settled = await Promise.allSettled(
      providerIds.map((id) =>
        input.registry
          .get(id)
          .search(
            input.userId,
            input.query,
            input.acting,
            scope !== undefined && id !== "custom"
              ? curatedCanonicalScope(scope)
              : scope,
          ),
      ),
    );
    const offeredElsewhere = new Set(
      settled.flatMap((result, index) =>
        result.status === "fulfilled" && providerIds[index] !== "custom"
          ? result.value.items.map((item) => item.toolkit)
          : [],
      ),
    );
    const fulfilled = settled.flatMap((result, index) =>
      result.status === "fulfilled"
        ? [
            providerIds[index] === "custom"
              ? {
                  ...result.value,
                  items: result.value.items.filter(
                    (item) =>
                      item.action !== "" ||
                      item.connected ||
                      !offeredElsewhere.has(item.toolkit),
                  ),
                }
              : result.value,
          ]
        : [],
    );
    const failures = settled.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    const fatal = failures.find((error) => input.fatalFailure?.(error));
    if (fatal) throw fatal;
    return {
      items: fulfilled.flatMap((result) => result.items),
      scopes: fulfilled.flatMap((result) =>
        result.scope ? [result.scope] : [],
      ),
      failures,
    };
  };

  let { items, scopes, failures } = await fanOut(input.app);
  const scopeIgnored = input.app !== undefined && scopes.includes("ignored");
  let unscopedFallback = false;
  if (
    input.app &&
    !scopeIgnored &&
    items.length === 0 &&
    failures.length === 0
  ) {
    ({ items, failures } = await fanOut(undefined));
    unscopedFallback = items.length > 0;
  }
  if (items.length === 0 && failures.length > 0) {
    throw (
      failures.find(
        (error) => error instanceof IntegrationSigninRequiredError,
      ) ?? failures[0]
    );
  }
  return {
    items,
    ...(unscopedFallback ? { unscopedFallback: true } : {}),
    ...(scopeIgnored ? { scopeIgnored: true } : {}),
  };
}

/** Inputs for one provider-selected integration action. */
export interface IntegrationExecuteInput {
  registry: IntegrationRegistry;
  userId: string;
  action: string;
  params: Record<string, unknown>;
  acting?: ActingContext;
  account?: string;
  provider?: string;
}

/** Execute an action once through its selected provider. */
export async function executeIntegration(
  input: IntegrationExecuteInput,
): Promise<ActionResult> {
  const provider = input.registry.get(
    input.provider ?? providerForAction(input.registry, input.action),
  );
  return provider.execute(
    input.userId,
    input.action,
    input.params,
    input.acting,
    input.account,
  );
}
