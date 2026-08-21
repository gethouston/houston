/**
 * A routine's connection health, scoped to whose credential can answer for it
 * (PRODUCT-1475).
 *
 * `/providers` describes the VIEWER's own credential scope; a fired routine
 * runs on its CREATOR's. So the probe is only evidence about the routine when
 * the viewer IS the creator — otherwise this reports `runsAsCreator` and the
 * surface says so in words instead of showing a badge that answers a different
 * question. The rules themselves are pure (`lib/routine-provider-health.ts`);
 * this hook only supplies the probe and the signed-in identity.
 */

import {
  type RoutineProviderHealth,
  routineProviderHealth,
  viewerIsRoutineCreator,
} from "../lib/routine-provider-health";
import { useProviderStatuses } from "./use-provider-statuses";
import { useSession } from "./use-session";

export interface RoutineHealthView {
  /** The badge is a claim this viewer's probe supports. */
  showBadge: boolean;
  /** Health of the resolved provider. Meaningless unless `showBadge`. */
  health: RoutineProviderHealth;
  /** Someone else created it: their account runs it, not the viewer's. */
  runsAsCreator: boolean;
}

export function useRoutineProviderHealth(
  createdBy: string | undefined,
  /** The RESOLVED provider id (see `useRoutineModelResolution`). */
  provider: string,
): RoutineHealthView {
  const { statuses } = useProviderStatuses();
  const { data: session } = useSession();
  const isCreator = viewerIsRoutineCreator(createdBy, session?.uid ?? null);
  return {
    // Nothing resolved yet = nothing to claim; the model row is still settling.
    showBadge: isCreator && !!provider,
    health: routineProviderHealth(statuses[provider]),
    runsAsCreator: !isCreator,
  };
}
