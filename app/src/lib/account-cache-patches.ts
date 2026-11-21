import type { ApiKey, ChannelStatus } from "@houston/wire-types";
import { withoutItems } from "./list-patch.ts";

export function apiKeysWithout(
  keys: ApiKey[] | undefined,
  id: string,
): ApiKey[] | undefined {
  return withoutItems(keys, (k) => k.id === id);
}

export function channelsWithout(
  status: ChannelStatus | undefined,
  connectionId: string,
): ChannelStatus | undefined {
  if (!status) return status;
  const connections = withoutItems(
    status.connections,
    (c) => c.id === connectionId,
  );
  return connections === status.connections
    ? status
    : { ...status, connections };
}
