import { useEffect, useRef } from "react";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { ProviderInfo } from "../../lib/providers";
import { resolveAutoSelect, type StatusSnapshot } from "./auto-select";

export function useProviderAutoSelect(
  connections: ProviderConnections,
  providers: readonly ProviderInfo[],
  onSelect: ((providerId: string, model: string) => void) | undefined,
  selectOnMount: boolean,
): void {
  const prevStatuses = useRef<StatusSnapshot | null>(null);
  useEffect(() => {
    if (!onSelect || !connections.probed) return;
    const selection = resolveAutoSelect(
      prevStatuses.current,
      connections.statuses,
      providers,
      { selectOnMount },
    );
    prevStatuses.current = connections.statuses;
    if (selection) onSelect(selection.providerId, selection.model);
  }, [
    onSelect,
    connections.probed,
    connections.statuses,
    providers,
    selectOnMount,
  ]);
}
