import {
  type RoutineReaderAccount,
  viewerIsRoutineCreator,
} from "@houston/sdk";
import { useCallback } from "react";
import { toDisplayProviderIdOrNull } from "../lib/provider-overrides";
import {
  type RoutineProviderHealth,
  routineProviderHealth,
} from "../lib/routine-provider-health";
import { useProviderStatuses } from "./use-provider-statuses";
import { useSession } from "./use-session";

export interface RoutineHealthView {
  showBadge: boolean;
  health: RoutineProviderHealth;
  runsAsCreator: boolean;
}

export function useRoutineProviderHealth(
  createdBy: string | undefined,
  provider: string,
): RoutineHealthView {
  const { statuses } = useProviderStatuses();
  const { data: session } = useSession();
  const isCreator = viewerIsRoutineCreator(createdBy, session?.uid ?? null);
  return {
    showBadge: isCreator && !!provider,
    health: routineProviderHealth(statuses[provider]),
    runsAsCreator: !isCreator,
  };
}

export function useRoutineReader(
  createdBy: string | undefined,
): (provider: string) => RoutineReaderAccount {
  const { statuses } = useProviderStatuses();
  const { data: session } = useSession();
  const readerIsCreator = viewerIsRoutineCreator(
    createdBy,
    session?.uid ?? null,
  );
  return useCallback(
    (provider: string) => {
      const status = statuses[toDisplayProviderIdOrNull(provider) ?? provider];
      return {
        provider,
        health: status?.health,
        credentialScope: status?.credentialScope,
        readerIsCreator,
      };
    },
    [statuses, readerIsCreator],
  );
}
