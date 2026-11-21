import { addressesMission } from "@houston/domain";
import type { BoardPersistOptions, BoardStatus } from "@houston/sdk";
import type { PendingInteraction } from "@houston/wire-types";
import * as activities from "../activities";
import { emitLocalEcho } from "../bus";
import { agentPath as agentRoute } from "../control-plane";
import type { AdapterContext } from "./context";
import { viaSdk } from "./sdk-error";

export async function setActivityStatus(
  ctx: AdapterContext,
  agentPath: string,
  sessionKey: string,
  status: BoardStatus,
  pendingInteraction: PendingInteraction | null,
  turnCard?: { id?: string },
  opts?: BoardPersistOptions,
): Promise<void> {
  if (!ctx.cp) {
    activities.setStatusBySessionKey(
      agentPath,
      sessionKey,
      status,
      pendingInteraction,
      opts?.stamp,
    );
    emitLocalEcho("ActivityChanged", { agentPath });
    return;
  }
  const retryDelaysMs = [500, 1500, 3000];
  const board = `${agentRoute(agentPath)}/activities`;
  for (let i = 0; ; i++) {
    try {
      let id = turnCard?.id;
      if (id === undefined) {
        const list = await viaSdk(board, () =>
          ctx.sdk.activities.list(agentPath),
        );
        const match = list.find((a) => addressesMission(a, sessionKey));
        if (!match) return;
        id = match.id;
      }
      const cardId = id;
      await viaSdk(`${board}/${encodeURIComponent(cardId)}`, () =>
        ctx.sdk.activities.writes.update(
          agentPath,
          cardId,
          {
            status,
            pending_interaction: pendingInteraction,
          },
          opts?.stamp,
        ),
      );
      if (turnCard) turnCard.id = cardId;
      break;
    } catch (err) {
      if (turnCard) turnCard.id = undefined;
      if (i >= retryDelaysMs.length) throw err;
      await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
    }
  }
  emitLocalEcho("ActivityChanged", { agentPath });
}

export function turnCardWriter(
  ctx: AdapterContext,
  agentPath: string,
  sessionKey: string,
): (
  status: BoardStatus,
  pendingInteraction: PendingInteraction | null,
  opts?: BoardPersistOptions,
) => Promise<void> {
  const turnCard: { id?: string } = {};
  return (status, pendingInteraction, opts) =>
    setActivityStatus(
      ctx,
      agentPath,
      sessionKey,
      status,
      pendingInteraction,
      turnCard,
      opts,
    );
}
