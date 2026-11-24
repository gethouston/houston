export const CONVERSATION_TOO_LARGE_ASLEEP = "conversation_too_large_asleep";
export const CONVERSATION_OP_REFUSED = "conversation_op_refused";

export type ConversationEditRefusalCode =
  | typeof CONVERSATION_TOO_LARGE_ASLEEP
  | typeof CONVERSATION_OP_REFUSED;

export function isConversationEditRefusalCode(
  code: unknown,
): code is ConversationEditRefusalCode {
  return (
    code === CONVERSATION_TOO_LARGE_ASLEEP || code === CONVERSATION_OP_REFUSED
  );
}
