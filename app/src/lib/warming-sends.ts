import { pushPendingUserMessage } from "@houston/engine-adapter";
import { isAutoContinue } from "@houston/protocol";
import { getConversationFeed } from "../hooks/use-conversation-vm";
import { actingUser } from "./acting-user";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning/entry";
import { reportError } from "./error-report";
import { logger } from "./logger";
import {
  chooseWarmingPrompt,
  undeliverableSend,
  type WarmingSendInput,
  warmingSendRecord,
} from "./warming-send-prompt";
import { landWarmingRow, settleWarmingRow } from "./warming-send-row";
import { wireWarmingSend } from "./warming-send-wire";

const promptBuilders = new Map<string, () => Promise<string> | string>();

const flushing = new WeakSet<ProvisioningEntry>();

export function isFlushingWarmingSends(entry: ProvisioningEntry): boolean {
  return flushing.has(entry);
}

export interface QueueWarmingSendArgs extends WarmingSendInput {
  agentPath: string;
  buildPrompt?: () => Promise<string> | string;
}

export function buildWarmingSend(
  args: QueueWarmingSendArgs,
): PendingWarmingSend {
  if (!args.rowOnly && args.text.length > 0 && !isAutoContinue(args.text)) {
    pushPendingUserMessage(
      args.agentPath,
      args.sessionKey,
      args.text,
      actingUser(),
      args.mentions,
    );
  }
  const send = warmingSendRecord(args);
  if (args.buildPrompt) promptBuilders.set(send.id, args.buildPrompt);
  return send;
}

export function restoreWarmingBubbles(entry: ProvisioningEntry): void {
  const author = actingUser();
  for (const send of entry.pendingSends ?? []) {
    if (send.rowOnly || send.text.length === 0 || isAutoContinue(send.text))
      continue;
    if (getConversationFeed(entry.agentPath, send.sessionKey).length === 0) {
      pushPendingUserMessage(
        entry.agentPath,
        send.sessionKey,
        send.text,
        author,
        send.mentions,
      );
    }
  }
}

export async function flushWarmingSends(
  entry: ProvisioningEntry,
): Promise<void> {
  flushing.add(entry);
  for (let i = 0; ; i++) {
    const send = entry.pendingSends?.[i];
    if (!send) break;
    const build = promptBuilders.get(send.id);
    promptBuilders.delete(send.id);
    let built: string | undefined;
    if (build) {
      try {
        built = await build();
      } catch (e) {
        logger.error(`[warming-sends] prompt build failed: ${e}`);
      }
    }
    const landing = await landWarmingRow(entry, send);
    if (landing.kind === "aborted") return;
    const { rowId } = landing;
    if (send.rowOnly) continue;
    const wire = chooseWarmingPrompt(send, built);
    if (!wire) {
      const undeliverable = undeliverableSend(send, rowId);
      reportError("warming_sends_prompt", undeliverable.reason);
      if (
        undeliverable.settleRow &&
        !(await settleWarmingRow(entry, undeliverable.settleRow, send))
      ) {
        return;
      }
      continue;
    }
    if ((await wireWarmingSend(entry, send, wire, rowId)) === "abort") return;
  }
}
