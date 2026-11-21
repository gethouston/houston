import type { IntegrationProviderId } from "@houston/protocol";
import { curatedCanonicalScope } from "../integrations/custom/curated";
import { CUSTOM_ACTION_PREFIX } from "../integrations/custom/provider";
import type { ActingContext } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import { exactScopeRows } from "../integrations/scope-resolve";
import {
  type ActionResult,
  IntegrationSigninRequiredError,
  type ToolMatch,
} from "../integrations/types";

export function providerForAction(
  registry: IntegrationRegistry,
  action: string,
): IntegrationProviderId {
  const ids = registry.ids();
  if (action.startsWith(CUSTOM_ACTION_PREFIX) && ids.includes("custom")) {
    return "custom";
  }
  return ids.find((id) => id !== "custom") ?? ids[0] ?? "custom";
}

export interface IntegrationSearchInput {
  registry: IntegrationRegistry;
  userId: string;
  query: string;
  acting?: ActingContext;
  app?: string;
  provider?: IntegrationProviderId;
  fatalFailure?: (error: unknown) => boolean;
}

export interface IntegrationSearchOutput {
  items: ToolMatch[];
  unscopedFallback?: true;
  scopeIgnored?: true;
}

async function scopeProviders(
  input: IntegrationSearchInput,
  providerIds: IntegrationProviderId[],
  app: string | undefined,
): Promise<{ ids: IntegrationProviderId[]; failure?: unknown }> {
  if (app === undefined || input.provider || !providerIds.includes("custom"))
    return { ids: providerIds };
  try {
    const own = await input.registry.get("custom").listToolkits();
    return {
      ids: exactScopeRows(own, app).length > 0 ? ["custom"] : providerIds,
    };
  } catch (failure) {
    return { ids: providerIds, failure };
  }
}

export async function searchIntegrations(
  input: IntegrationSearchInput,
): Promise<IntegrationSearchOutput> {
  const allProviderIds = input.provider
    ? [input.provider]
    : input.registry.ids();
  const fanOut = async (scope: string | undefined) => {
    const owners = await scopeProviders(input, allProviderIds, scope);
    const providerIds = owners.ids;
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
    if (owners.failure !== undefined) failures.push(owners.failure);
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

export interface IntegrationExecuteInput {
  registry: IntegrationRegistry;
  userId: string;
  action: string;
  params: Record<string, unknown>;
  acting?: ActingContext;
  account?: string;
  provider?: IntegrationProviderId;
}

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
