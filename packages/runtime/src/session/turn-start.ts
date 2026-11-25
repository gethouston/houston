import type { ChatMessage } from "@houston/runtime-client";
import {
  logTurnTarget,
  resolveTurnTarget,
  type TurnPinSource,
  turnTargetIsRunnable,
} from "../ai/turn-diagnostic";
import { syncServedCredentialSafe } from "../auth/serve";
import { config } from "../config";
import type { ActingContext } from "./acting-context";
import { publish } from "./bus";
import { type Conversation, getConversation } from "./conversation-cache";
import {
  type CleanTurn,
  execTurn,
  recordUserTurn,
  type TurnPin,
} from "./exec-turn";
import type { MissionTitleRequest } from "./mission-title";
import { titleMissionAfterTurn } from "./mission-title-report";
import { connectedProviderForTurn } from "./provider-gate";
import { withTurnInFlight } from "./turn-inflight-count";
import {
  type CardAnswer,
  refuseQueuedCardAnswer,
  reportTurnStartFailure,
  type TurnStartFailure,
} from "./turn-start-failure";
import { inTurnOrder, refusePinnedProvider } from "./turn-start-order";
import { withWorkdirLock } from "./workdir-lock";
import type { ProvidedContext } from "./workspace-context";

export async function ensureProviderForTurn(
  pin?: TurnPinSource,
): Promise<string | null> {
  await syncServedCredentialSafe("serve");
  const target = resolveTurnTarget(pin);
  if (turnTargetIsRunnable(target)) logTurnTarget(target);
  return connectedProviderForTurn();
}

export const runTurn = (
  ...args: Parameters<typeof runAcceptedTurn>
): Promise<void> => withTurnInFlight(() => runAcceptedTurn(...args));

// WHY: A cached session skips resolveModel's guard; without a recheck it prompts with no credential. ADR-0012
async function runAcceptedTurn(
  id: string,
  text: string,
  nonce?: string,
  pin?: TurnPin,
  acting?: ActingContext,
  context?: ProvidedContext,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
  acceptedTurnId?: string,
  options?: {
    resumeOf?: string;
    missionTitle?: MissionTitleRequest;
    cardAnswer?: CardAnswer;
    routineFire?: boolean;
  },
): Promise<void> {
  const turnId = acceptedTurnId ?? crypto.randomUUID();
  const failure: TurnStartFailure = {
    id,
    turnId,
    text,
    nonce,
    displayText,
    mentions,
  };
  if (await refusePinnedProvider(failure, pin, options?.cardAnswer)) return;
  if (!pin?.provider && !(await connectedProviderForTurn())) {
    publish(id, {
      type: "error",
      data: { message: "No provider connected. Connect an AI provider first." },
      turnId,
    });
    return;
  }

  let conv: Conversation;
  const buildStart = performance.now();
  try {
    conv = await getConversation(id, pin, context);
  } catch (err) {
    await inTurnOrder(failure, options?.cardAnswer, () =>
      reportTurnStartFailure(failure, err, pin),
    );
    return;
  }
  const startup = {
    sessionBuildMs: performance.now() - buildStart,
    queuedAt: performance.now(),
  };

  conv.pending++;
  const run = conv.queue.then(() => {
    if (refuseQueuedCardAnswer(id, turnId, options?.cardAnswer)) return null;
    const recorded = recordUserTurn(
      conv,
      id,
      turnId,
      text,
      nonce,
      acting,
      displayText,
      mentions,
      {
        pin,
        ...(context ? { context } : {}),
        ...(options?.resumeOf ? { resumeOf: options.resumeOf } : {}),
      },
    );
    recorded.routineFire = options?.routineFire === true;
    return withWorkdirLock(config.workspaceDir, () =>
      execTurn(conv, id, turnId, text, recorded, pin, acting, startup),
    );
  });
  conv.queue = run.catch(() => {});
  let clean: CleanTurn | null = null;
  try {
    clean = await run;
  } finally {
    conv.pending--;
  }
  if (options?.missionTitle && clean)
    void titleMissionAfterTurn(id, options.missionTitle, clean.model, acting);
}
