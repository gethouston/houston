import type { IncomingMessage, ServerResponse } from "node:http";
import { json, readJson } from "./server-http";
import { type ProviderWarmer, providerWarmUrl } from "./turn-provider-warm";

const PREWARM_BODY_MAX_BYTES = 16 * 1024;

/** What the gateway names when it holds this sandbox for a person's coming
 *  send. Never a credential: the turn brings its own. */
export interface PrewarmRequest {
  provider: string;
  model?: string;
  enterpriseUrl?: string;
  holdMs: number;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`invalid '${field}'`);
  return value;
}

export function parsePrewarmRequest(body: unknown): PrewarmRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("prewarm body must be an object");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.provider !== "string" || raw.provider === "") {
    throw new Error("invalid 'provider'");
  }
  if (
    typeof raw.holdMs !== "number" ||
    !Number.isFinite(raw.holdMs) ||
    raw.holdMs < 0
  ) {
    throw new Error("invalid 'holdMs'");
  }
  return {
    provider: raw.provider,
    model: optionalString(raw.model, "model"),
    enterpriseUrl: optionalString(raw.enterpriseUrl, "enterpriseUrl"),
    holdMs: raw.holdMs,
  };
}

/**
 * POST /prewarm, behind the turn's own token, incarnation and draining gates.
 * It takes no admission slot (a single-use worker admits exactly one request,
 * its turn), writes no file and never spends the worker: it only opens the
 * provider connection the turn will use.
 */
export async function servePrewarm(
  warmer: ProviderWarmer,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let request: PrewarmRequest;
  try {
    request = parsePrewarmRequest(await readJson(req, PREWARM_BODY_MAX_BYTES));
  } catch (error) {
    return json(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const url = providerWarmUrl(
    request.provider,
    request.model,
    request.enterpriseUrl,
  );
  const warming = url ? warmer.start(url, request.holdMs) : false;
  return json(res, 202, { warming });
}
