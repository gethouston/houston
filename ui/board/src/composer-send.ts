import type { MessageMention } from "@houston-ai/chat";

/**
 * What a submit interceptor answers. `true` means it sent the message itself;
 * `false` lets the board route the typed text; a rewrite lets the board route
 * `text` in its place (context gathered outside the text box) and runs
 * `onSent` once that send lands, never when it fails.
 */
export type ComposerSubmitOutcome =
  | boolean
  | { text: string; onSent: () => void };

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

/** Where a routed submit went: nowhere, an interceptor, an existing
 *  conversation, or a new one with its id. */
export type ComposerSendResult =
  | { kind: "dropped" }
  | { kind: "handled" }
  | { kind: "sent" }
  | { kind: "created"; activityId: string };

/**
 * The composer's unified send: let the interceptor take or rewrite it, then
 * follow up an existing conversation or create one. A throw propagates, so the
 * composer keeps the draft.
 */
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
  // Keyed off `activeSessionKey`, not the selected item: a send fired while
  // the created activity is still absent from `items` must go to the existing
  // session, never fall through and create a duplicate conversation.
  if (activeSessionKey && routes.onSendMessage) {
    await routes.onSendMessage(activeSessionKey, text, files, mentions);
    rewrite?.onSent();
    return { kind: "sent" };
  }
  if (args.canCreate && routes.onCreateConversation) {
    const activityId = await routes.onCreateConversation(text, files, mentions);
    rewrite?.onSent();
    return { kind: "created", activityId };
  }
  return { kind: "dropped" };
}
