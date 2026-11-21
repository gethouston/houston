export const TurnErrorCode = {
  TimeLimit: "turn_time_limit",
  TimeLimitUnsaved: "turn_time_limit_unsaved",
} as const;

export type TurnErrorCode = (typeof TurnErrorCode)[keyof typeof TurnErrorCode];

export interface TurnErrorData {
  message: string;
  code?: TurnErrorCode | (string & {});
}
