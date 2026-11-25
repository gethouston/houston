import type {
  CustomIntegrationScope,
  CustomIntegrationView,
  IntegrationConnection,
} from "@houston/wire-types";
import { mapItem, withoutItems } from "./list-patch.ts";
import type { OptimisticPatch } from "./optimistic-core.ts";
import { queryKeys } from "./query-keys.ts";

/**
 * Optimistic edits of the integration caches. Custom lists are `null` when the
 * host does not serve custom integrations; that stays `null`.
 */

type CustomList = CustomIntegrationView[] | null | undefined;

/** A disconnect: one account of the app, or every account when unnamed. */
export function connectionsWithout(
  connections: IntegrationConnection[] | undefined,
  toolkit: string,
  connectionId?: string,
): IntegrationConnection[] | undefined {
  return withoutItems(
    connections,
    (c) =>
      c.toolkit === toolkit &&
      (connectionId === undefined || c.connectionId === connectionId),
  );
}

export function customWithout(list: CustomList, slug: string): CustomList {
  return withoutItems(list, (i) => i.slug === slug);
}

/** The edit form's name + website; an empty website clears it, as the host does. */
export function customWithDetails(
  list: CustomList,
  slug: string,
  details: { name: string; website: string },
): CustomList {
  return mapItem(
    list,
    (i) => i.slug === slug,
    (i) => {
      const website = details.website || undefined;
      if (i.name === details.name && i.website === website) return i;
      const { website: _old, ...rest } = i;
      return website === undefined
        ? { ...rest, name: details.name }
        : { ...rest, name: details.name, website };
    },
  );
}

/** Where a custom-integration write was sent: the deployment's scope
 *  (`customIntegrationScope`) and the per-agent route's agent, if any. */
export interface CustomWriteTarget {
  scope: CustomIntegrationScope;
  agentId?: string;
}

/**
 * The custom lists that hold an integration written through `target`. A
 * shared host keeps ONE definitions file, so the top-level list and every
 * agent's copy are the same list (one key prefix). On a per-agent deployment
 * only the written agent's list holds it: the shared prefix would also paint
 * another agent's integration that happens to share the slug. A per-agent
 * deployment with no agent named has no list to paint (the top-level form
 * does not reach a pod).
 */
export function customListKeys({ scope, agentId }: CustomWriteTarget) {
  if (scope === "host") return [queryKeys.customIntegrations()];
  return agentId ? [queryKeys.agentCustomIntegrations(agentId)] : [];
}

/** Every cache the integration shows in: its lists (`customListKeys`) and,
 *  on a shared host, the host-level connections view (slug = toolkit). The
 *  gateway does not serve that view, so a per-agent deployment has none. */
export function customRemovalPatches(
  slug: string,
  target: CustomWriteTarget,
): OptimisticPatch[] {
  const lists = customListKeys(target).map((queryKey): OptimisticPatch => ({
    queryKey,
    apply: (list: CustomList) => customWithout(list, slug),
  }));
  if (target.scope !== "host") return lists;
  return [
    ...lists,
    {
      queryKey: queryKeys.integrationConnections("custom"),
      apply: (rows: IntegrationConnection[] | undefined) =>
        connectionsWithout(rows, slug),
    },
  ];
}

export function customEditPatches(
  slug: string,
  details: { name: string; website: string },
  target: CustomWriteTarget,
): OptimisticPatch[] {
  return customListKeys(target).map((queryKey) => ({
    queryKey,
    apply: (list: CustomList) => customWithDetails(list, slug, details),
  }));
}
