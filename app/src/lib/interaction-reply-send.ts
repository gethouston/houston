import type { MessageApproval } from "@houston/protocol/approval";
import {
  type AttachmentSend,
  prepareAttachmentSend,
} from "./attachment-message";
import type { TurnMode } from "./turn-mode";

export interface InteractionReply {
  text: string;
  mode: TurnMode;
  approvals?: MessageApproval[];
  files: readonly File[];
}

export interface InteractionReplySendOptions {
  providerOverride: string;
  modelOverride: string;
  effortOverride?: string;
  modeOverride: TurnMode;
  approvals?: MessageApproval[];
  queuedPreview?: AttachmentSend["queuedPreview"];
}

export interface InteractionReplyPorts {
  resolvePin: () => Promise<{
    provider: string;
    model: string;
    effort?: string;
  }>;
  save: (files: File[]) => Promise<string[]>;
  send: (prompt: string, opts: InteractionReplySendOptions) => Promise<unknown>;
  onSent: (files: readonly File[]) => void;
  onFailed: (err: unknown) => void;
  onSentThrew: (err: unknown) => void;
}

export async function sendInteractionReply(
  reply: InteractionReply,
  ports: InteractionReplyPorts,
): Promise<boolean> {
  try {
    const [pin, attached] = await Promise.all([
      ports.resolvePin(),
      reply.files.length > 0
        ? prepareAttachmentSend(reply.text, reply.files, ports.save)
        : null,
    ]);
    await ports.send(attached?.prompt ?? reply.text, {
      providerOverride: pin.provider,
      modelOverride: pin.model,
      effortOverride: pin.effort,
      modeOverride: reply.mode,
      ...(reply.approvals?.length ? { approvals: reply.approvals } : {}),
      ...(attached ? { queuedPreview: attached.queuedPreview } : {}),
    });
  } catch (err) {
    ports.onFailed(err);
    return false;
  }
  try {
    ports.onSent(reply.files);
  } catch (err) {
    ports.onSentThrew(err);
  }
  return true;
}
