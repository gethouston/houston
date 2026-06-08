/**
 * App-side helpers for structured question / answer chat messages.
 *
 * Decoding lives in `@houston-ai/chat`. This file keeps feed lookup and
 * re-exports the encoder from `question-message-encode.ts`.
 */

import {
  decodeQuestionAnswerMessage as decodeQuestionAnswerMessageFromChat,
  type FeedItem,
  type QuestionAnswerSet,
} from "@houston-ai/chat";

export type {
  QuestionAnswerSet,
  QuestionSpec,
  DecodedQuestionAnswerMessage,
} from "@houston-ai/chat";

export {
  encodeQuestionAnswerMessage,
  formatQuestionAnswersReadable,
} from "./question-message-encode.ts";

export const decodeQuestionAnswerMessage = decodeQuestionAnswerMessageFromChat;

/**
 * Find a prior answer for this question set in the session feed.
 */
export function findQuestionAnswerInFeed(
  feedItems: readonly FeedItem[],
  specId: string,
): QuestionAnswerSet | null {
  for (const item of feedItems) {
    if (item.feed_type !== "user_message") continue;
    const decoded = decodeQuestionAnswerMessageFromChat(item.data);
    if (decoded?.answerSet.id === specId) {
      return decoded.answerSet;
    }
  }
  return null;
}
