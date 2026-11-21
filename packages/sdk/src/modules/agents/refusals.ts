import { NAME_RESERVED, NAME_TAKEN } from "@houston/protocol/file-refusal";
import { refusalCode, refusalStatus } from "../refusal-code";

export function isAgentNameTaken(error: unknown): boolean {
  if (!(error instanceof Error) || refusalStatus(error) !== 409) return false;
  const code = refusalCode(error);
  return code === null || code === NAME_TAKEN;
}

export function isAgentNameReserved(error: unknown): boolean {
  return error instanceof Error && refusalCode(error) === NAME_RESERVED;
}
