import type { MessageMention } from "@houston-ai/chat";

export type ComposerSubmitOutcome =
  | boolean
  | { text: string; onUnsent: () => void };

export interface ComposerSendRoutes {
  onComposerSubmit?: (ctx: {
    sessionKey: string | null;
    text: string;
    files: File[];
    hasMessages: boolean;
    mentions: MessageMention[];
  }) => ComposerSubmitOutcome | Promise<ComposerSubmitOutcome>;
  onSendMessage?: (
    sessionKey: string,
    text: string,
    files: File[],
    mentions?: MessageMention[],
  ) => Promise<void>;
  onCreateConversation?: (
    text: string,
    files: File[],
    mentions?: MessageMention[],
  ) => Promise<string>;
}

export type ComposerSendResult =
  | { kind: "dropped" }
  | { kind: "handled" }
  | { kind: "sent" }
  | { kind: "created"; activityId: string };

export async function routeComposerSend(
  routes: ComposerSendRoutes,
  args: {
    activeSessionKey: string | null;
    canCreate: boolean;
    hasMessages: boolean;
    text: string;
    files: File[];
    mentions: MessageMention[];
  },
): Promise<ComposerSendResult> {
  const { activeSessionKey, files, mentions } = args;
  const outcome = await routes.onComposerSubmit?.({
    sessionKey: activeSessionKey,
    text: args.text,
    files,
    hasMessages: args.hasMessages,
    mentions,
  });
  if (outcome === true) return { kind: "handled" };
  const rewrite = typeof outcome === "object" ? outcome : null;
  const text = rewrite?.text ?? args.text;
  try {
    if (activeSessionKey && routes.onSendMessage) {
      await routes.onSendMessage(activeSessionKey, text, files, mentions);
      return { kind: "sent" };
    }
    if (args.canCreate && routes.onCreateConversation) {
      const activityId = await routes.onCreateConversation(
        text,
        files,
        mentions,
      );
      return { kind: "created", activityId };
    }
  } catch (error) {
    rewrite?.onUnsent();
    throw error;
  }
  rewrite?.onUnsent();
  return { kind: "dropped" };
}
