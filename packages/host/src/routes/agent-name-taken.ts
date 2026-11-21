import type { ServerResponse } from "node:http";
import { NAME_TAKEN } from "@houston/protocol";
import { AgentNameConflictError } from "../ports";
import { json } from "./http";

export function answerAgentNameTaken(
  res: ServerResponse,
  err: unknown,
): boolean {
  if (!(err instanceof AgentNameConflictError)) return false;
  json(res, 409, { error: err.message, code: NAME_TAKEN });
  return true;
}
