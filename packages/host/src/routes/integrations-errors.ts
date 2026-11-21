import type { ServerResponse } from "node:http";
import { IntegrationUpstreamError } from "../integrations/types";
import { json } from "./http";

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
