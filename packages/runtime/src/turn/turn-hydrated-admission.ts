import type { ServerResponse } from "node:http";
import {
  notInteractionOwnerBody,
  refusesInteractionAnswer,
} from "../store/interaction-owner";
import { json } from "./server-http";
import { type CardOwnerRead, startCardOwnerRead } from "./turn-card-owner-read";
import type { TurnFilesystemPreparation } from "./turn-filesystem";
import { TurnSetupError } from "./turn-layout";
import {
  reportAbandonedTurnStartup,
  type TurnSessionStartupTask,
} from "./turn-session-startup";
import type { ResolvedTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

export async function refuseHydratedTurn(input: {
  turn: TurnRequest;
  preparation: TurnFilesystemPreparation;
  resolved: ResolvedTurnStore;
  sandbox: { admission: () => Promise<string | null> } | null;
  startup: TurnSessionStartupTask | undefined;
  timings: Record<string, number>;
  res: ServerResponse;
}): Promise<boolean> {
  const { turn, timings } = input;
  const actingUserId =
    turn.actingAs && !turn.routine && !turn.shadow
      ? turn.actingAs.userId
      : undefined;
  let card: CardOwnerRead | undefined;
  try {
    if (actingUserId)
      card = startCardOwnerRead(
        turn,
        input.preparation.filesystem,
        input.resolved,
        timings,
      );
    await input.preparation.hydrated;
    timings.t_hydrated = performance.now();
    if (card && refusesInteractionAnswer(await card.messages(), actingUserId)) {
      await reportAbandonedTurnStartup(input.startup);
      json(input.res, 403, notInteractionOwnerBody);
      return true;
    }
    timings.t_card_checked = performance.now();
    const refused = await input.sandbox?.admission();
    if (refused) throw new TurnSetupError("message_refused", refused);
    return false;
  } catch (error) {
    card?.abort();
    await card?.settled;
    await reportAbandonedTurnStartup(input.startup);
    throw error;
  }
}
