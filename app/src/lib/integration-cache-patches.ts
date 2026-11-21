import type {
  CustomIntegrationScope,
  CustomIntegrationView,
  IntegrationConnection,
} from "@houston/wire-types";
import { mapItem, withoutItems } from "./list-patch.ts";
import type { OptimisticPatch } from "./optimistic-core.ts";
import { queryKeys } from "./query-keys.ts";

type CustomList = CustomIntegrationView[] | null | undefined;

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

export interface CustomWriteTarget {
  scope: CustomIntegrationScope;
  agentId?: string;
}

export function customListKeys({ scope, agentId }: CustomWriteTarget) {
  if (scope === "host") return [queryKeys.customIntegrations()];
  return agentId ? [queryKeys.agentCustomIntegrations(agentId)] : [];
}

export function customRemovalPatches(
  slug: string,
  target: CustomWriteTarget,
): OptimisticPatch[] {
  const lists = customListKeys(target).map(
    (queryKey): OptimisticPatch => ({
      queryKey,
      apply: (list: CustomList) => customWithout(list, slug),
    }),
  );
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
