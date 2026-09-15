import type { ServerResponse } from "node:http";
import { IntegrationUpstreamError } from "../integrations/types";
import { json } from "./http";

/**
 * The two failure shapes every integrations surface relays identically — the
 * user routes (integrations.ts, integrations-provider.ts) and the runtime
 * proxy (integrations-sandbox.ts). Clients classify on `code`, never on a bare
 * status, so both bodies are part of the contract.
 */

/** 409 + code for "the user must sign in to Houston first". */
export const signinRequired = (res: ServerResponse) =>
  json(res, 409, {
    error: "sign in to Houston to use integrations",
    code: "signin_required",
  });

export const relayIntegrationUpstreamError = (
  res: ServerResponse,
  err: unknown,
): boolean => {
  if (!(err instanceof IntegrationUpstreamError)) return false;
  json(res, err.status, err.body);
  return true;
};
