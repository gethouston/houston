import type { IncomingMessage, ServerResponse } from "node:http";
import { parseClaudeOAuthEnvelope } from "@houston/protocol";
import { RevokedRefillBlockedError } from "../credentials/revocation-tombstones";
import {
  ApiKeyRejectedError,
  type ChannelCtx,
  type RuntimeChannel,
} from "../ports";
import { json, readJson } from "./http";

/**
 * The setup runtime's CREDENTIAL routes — the agentless mirrors of the
 * per-agent `/agents/:id/credential/*` family (see `setup-runtime.ts` for why
 * a hidden runtime exists at all). Each lands on the caller's PERSONAL
 * workspace through the synthetic setup agent, so a credential connected or
 * forgotten here is the one every real agent runtime is served from.
 *
 * Handled host-side ahead of the runtime allowlist: none of these reach the
 * runtime's own routes, and the per-agent handlers they mirror have the same
 * body validation + error mapping.
 *
 * Returns true when the request was handled.
 */
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

  // Connect-once capture: store the setup runtime's fresh credential for the
  // WHOLE personal workspace and scrub its refresh token — identical to the
  // per-agent `/agents/:id/credential/capture`, minus the agent.
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

  // Connect-once logout, agentless: a space with NO agent (first-run before
  // the assistant exists, a failed first create, a deleted last agent) still
  // holds the central credential the user connected through this runtime, and
  // this is the only runtime that can forget it (PRODUCT-1662). Mirrors the
  // per-agent `/agents/:id/credential/forget`; the client clears the setup
  // runtime's own auth copy through `auth/:provider/logout` alongside.
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

  // API-key provider connect (no OAuth dance): store centrally + push into the
  // setup runtime so `auth/status` reads connected immediately.
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
      // Mirror the per-agent route: the runtime's typed verification reason
      // rides the body so the connect dialog can show actionable copy.
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof ApiKeyRejectedError && err.reason
          ? { reason: err.reason }
          : {}),
      });
    }
    return true;
  }

  // Claude-subscription connect pre-agent: the desktop's browser login mints
  // the OAuth credential locally, and with NO agent selected yet (first-run
  // onboarding, the cloud-migration wizard) it lands here — the setup
  // runtime's workspace-central store serves every agent created or migrated
  // after. Mirrors the per-agent `/agents/:id/credential/claude-oauth`: the
  // envelope is validated (a malformed push is a clean 400, never a false
  // success) so the desktop can fall back to the paste flow.
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
        // Fill-only for a cached-snapshot reconcile (HOU-855) — mirrors the
        // per-agent claude-oauth route.
        ifAbsent: url.searchParams.get("if_absent") === "1",
      });
      json(res, 200, { ok: true });
    } catch (err) {
      // 409, not 502: the fill was refused on purpose (the credential was
      // just provider-revoked — HOUSTON-APP-530), not lost to a broken hop.
      json(res, err instanceof RevokedRefillBlockedError ? 409 : 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  return false;
}
