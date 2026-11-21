import type { ChatMessage } from "@houston/runtime-client";
import { config } from "../config";
import { type ActingContext, runWithActingContext } from "./acting-context";
import { holdConversationTurn } from "./conversation-command-gate";
import { isDraining as runtimeIsDraining } from "./drain";
import type { TurnPin } from "./exec-turn";
import { encodeResumePrompt } from "./resume-prompt";
import {
  type ResumeProviderProbes,
  resumeProviderReady,
} from "./resume-provider-gate";
import type { ResumeRequest } from "./resume-request";
import { resumeWasRecorded, revokeResume } from "./resume-revoke";
import { actingFromPersisted } from "./turn-resume-info";
import type { ProvidedContext } from "./workspace-context";

export const RESUME_DELAY_MS = 2_000;

export interface ResumeInterruptedTurnsDeps extends ResumeProviderProbes {
  runTurn: (
    id: string,
    text: string,
    nonce: undefined,
    pin: TurnPin | undefined,
    acting: ActingContext | undefined,
    context: ProvidedContext | undefined,
    displayText: undefined,
    mentions: ChatMessage["mentions"] | undefined,
    acceptedTurnId: undefined,
    options: { resumeOf: string },
  ) => Promise<void>;
  log?: (message: string, error: unknown) => void;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  holdTurn?: (id: string, turn: Promise<void>) => void;
  isDraining?: () => boolean;
  runWithActing?: <T>(acting: ActingContext | undefined, fn: () => T) => T;
  dataDir?: string;
  revoke?: (conversationId: string, turnId: string) => void;
  recorded?: (conversationId: string, prompt: string) => boolean;
}

export async function resumeInterruptedTurns(
  requests: readonly ResumeRequest[],
  deps: ResumeInterruptedTurnsDeps,
): Promise<void> {
  if (requests.length === 0) return;
  const log =
    deps.log ??
    ((message: string, error: unknown) => console.error(message, error));
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const holdTurn = deps.holdTurn ?? holdConversationTurn;
  const isDraining = deps.isDraining ?? runtimeIsDraining;
  const runWithActing = deps.runWithActing ?? runWithActingContext;
  const dataDir = deps.dataDir ?? config.dataDir;
  const revoke =
    deps.revoke ??
    ((id: string, turnId: string) => revokeResume(dataDir, id, turnId));
  const recorded =
    deps.recorded ??
    ((id: string, prompt: string) => resumeWasRecorded(dataDir, id, prompt));
  const giveUp = (request: ResumeRequest) => {
    try {
      revoke(request.conversationId, request.turnId);
    } catch (error) {
      log(
        `[turn] resume after restart could not be revoked conversation=${request.conversationId} turn=${request.turnId}`,
        error,
      );
    }
  };
  await sleep(deps.delayMs ?? RESUME_DELAY_MS);
  for (const [index, request] of requests.entries()) {
    const where = `conversation=${request.conversationId} turn=${request.turnId}`;
    if (isDraining()) {
      log(
        `[turn] resume after restart skipped, runtime is draining ${where}`,
        undefined,
      );
      for (const pending of requests.slice(index)) giveUp(pending);
      return;
    }
    const prompt = encodeResumePrompt(request);
    let started: boolean;
    try {
      started = await runWithActing(actingFromPersisted(request.acting), () =>
        startResume(request, prompt, { deps, holdTurn, sleep }),
      );
    } catch (error) {
      log(`[turn] resume after restart failed ${where}`, error);
      giveUp(request);
      continue;
    }
    if (!started) {
      log(
        `[turn] resume after restart dropped, no provider connected ${where}`,
        undefined,
      );
      giveUp(request);
      continue;
    }
    if (!recorded(request.conversationId, prompt)) {
      log(
        `[turn] resume after restart recorded nothing, the turn was refused ${where}`,
        undefined,
      );
      giveUp(request);
    }
  }
}

interface ResumeRunners {
  deps: ResumeInterruptedTurnsDeps;
  holdTurn: (id: string, turn: Promise<void>) => void;
  sleep: (ms: number) => Promise<void>;
}

async function startResume(
  request: ResumeRequest,
  prompt: string,
  { deps, holdTurn, sleep }: ResumeRunners,
): Promise<boolean> {
  const ready = await resumeProviderReady(request, deps, sleep);
  if (!ready) return false;
  const turn = deps.runTurn(
    request.conversationId,
    prompt,
    undefined,
    request.pin,
    actingFromPersisted(request.acting),
    request.context,
    undefined,
    request.mentions,
    undefined,
    { resumeOf: request.turnId },
  );
  holdTurn(request.conversationId, turn);
  await turn;
  return true;
}
