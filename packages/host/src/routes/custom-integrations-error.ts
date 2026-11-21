import type { ServerResponse } from "node:http";
import { CustomIntegrationError } from "../integrations/custom/types";
import { json } from "./http";

export function customErrorAnswer(err: unknown) {
  if (!(err instanceof CustomIntegrationError)) return null;
  return {
    status:
      err.code === "not_found"
        ? 404
        : err.code === "duplicate_slug"
          ? 409
          : 400,
    body: { error: err.message, code: err.code },
  };
}

export function relayCustomError(res: ServerResponse, err: unknown): boolean {
  const answer = customErrorAnswer(err);
  if (!answer) return false;
  json(res, answer.status, answer.body);
  return true;
}
