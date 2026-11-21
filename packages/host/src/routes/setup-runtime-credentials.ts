import type { IncomingMessage, ServerResponse } from "node:http";
import { parseClaudeOAuthEnvelope } from "@houston/protocol";
import { RevokedRefillBlockedError } from "../credentials/revocation-tombstones";
import {
  ApiKeyRejectedError,
  type ChannelCtx,
  type RuntimeChannel,
} from "../ports";
import { json, readJson } from "./http";
import type { HttpMethod } from "./registry";

export const SETUP_CREDENTIAL_RESTS = [
  { method: "POST", rest: "credential/capture" },
  { method: "POST", rest: "credential/forget" },
  { method: "POST", rest: "credential/api-key" },
  { method: "POST", rest: "credential/claude-oauth" },
] as const satisfies readonly { method: HttpMethod; rest: string }[];

export async function handleSetupCredential(
  channel: RuntimeChannel,
  ctx: ChannelCtx,
  method: string,
  rest: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "POST") return false;

  if (rest === "credential/capture") {
    const body = (await readJson(req).catch(() => ({}))) as {
      provider?: unknown;
    };
    const provider =
      typeof body.provider === "string" ? body.provider : undefined;
    const result = await channel.captureCredential(ctx, provider);
    if (result.ok) json(res, 200, { ok: true, provider: result.provider });
    else
      json(res, result.status, {
        error: result.error,
        ...(result.detail ? { detail: result.detail } : {}),
      });
    return true;
  }

  if (rest === "credential/forget") {
    const { provider } = await readJson(req);
    if (!provider || typeof provider !== "string") {
      json(res, 400, { error: "missing 'provider'" });
      return true;
    }
    await channel.forgetCredential(ctx, provider);
    json(res, 200, { ok: true });
    return true;
  }

  if (rest === "credential/api-key") {
    const { provider, apiKey, endpoint } = await readJson(req);
    if (!provider || typeof provider !== "string") {
      json(res, 400, { error: "missing 'provider'" });
      return true;
    }
    if (!apiKey || typeof apiKey !== "string") {
      json(res, 400, { error: "missing 'apiKey'" });
      return true;
    }
    try {
      await channel.saveApiKeyCredential(
        ctx,
        provider,
        apiKey,
        typeof endpoint === "string" && endpoint.trim()
          ? endpoint.trim()
          : undefined,
      );
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof ApiKeyRejectedError && err.reason
          ? { reason: err.reason }
          : {}),
      });
    }
    return true;
  }

  if (rest === "credential/claude-oauth") {
    const parsed = parseClaudeOAuthEnvelope(
      await readJson(req).catch(() => ({})),
    );
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error });
      return true;
    }
    try {
      await channel.saveClaudeOAuthCredential(ctx, parsed.value, {
        ifAbsent: url.searchParams.get("if_absent") === "1",
      });
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, err instanceof RevokedRefillBlockedError ? 409 : 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  return false;
}
