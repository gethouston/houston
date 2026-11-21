export type ReplyBeat =
  | { type: "tool_call_start"; name: string }
  | { type: "answer_end" };
