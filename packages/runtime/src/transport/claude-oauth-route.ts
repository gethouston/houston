import { parseClaudeOAuthEnvelope } from "@houston/runtime-client";
import { storeAnthropicOauth } from "../auth/anthropic-oauth-store";
import { serveModeOn } from "../auth/serve";
import { refreshAnthropicCredential } from "../backends/claude/credential-status";
import { writeClaudeOAuthCredentialFile } from "../backends/claude/credentials-file";
import { claudeLoginConfigDir } from "../backends/claude/paths";
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleClaudeOAuthCredential(ctx: RouteContext) {
  const parsed = parseClaudeOAuthEnvelope(
    await readJson(ctx.req).catch(() => ({})),
  );
  if (!parsed.ok) {
    json(ctx.res, 400, { error: parsed.error });
    return;
  }
  const cred = serveModeOn()
    ? { ...parsed.value, refreshToken: "" }
    : parsed.value;
  try {
    writeClaudeOAuthCredentialFile(claudeLoginConfigDir(), cred);
    storeAnthropicOauth({
      access: cred.accessToken,
      refresh: cred.refreshToken ?? "",
      expires: cred.expiresAt ?? 0,
    });
  } catch (e) {
    json(ctx.res, 500, {
      error: `could not materialize the Claude credential: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  await refreshAnthropicCredential(undefined, { force: true });
  json(ctx.res, 200, { ok: true });
}
