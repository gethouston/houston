export type FrameVerdict = "ours" | "foreign" | "boundary";

export function classifyFrame(
  mine: string | undefined,
  frameTurnId: string | undefined,
): FrameVerdict {
  if (!frameTurnId) return "ours";
  if (!mine) return "foreign";
  return frameTurnId === mine ? "ours" : "boundary";
}

export type RunningSyncVerdict = FrameVerdict | "adopt";

export function classifyRunningSync(
  mine: string | undefined,
  syncTurnId: string | undefined,
  mayAdopt: boolean,
): RunningSyncVerdict {
  if (!syncTurnId) return "ours";
  if (!mine) return mayAdopt ? "adopt" : "foreign";
  return syncTurnId === mine ? "ours" : "boundary";
}
