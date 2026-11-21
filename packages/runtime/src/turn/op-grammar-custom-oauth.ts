import type { CustomOAuthAttempt } from "@houston/host/src/integrations/custom/oauth-flow";
import { CUSTOM_SLUG } from "@houston/host/src/integrations/custom/types";
import { str } from "./op-grammar-fields";

export type CustomOAuthOp =
  | { kind: "custom-oauth"; action: "start"; slug: string; callbackUrl: string }
  | {
      kind: "custom-oauth";
      action: "complete";
      attempt: CustomOAuthAttempt;
      code: string;
    };

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function customOAuthCallbackUrl(value: unknown): string {
  const raw = str(value, "customOAuthCallbackUrl");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid 'customOAuthCallbackUrl'");
  }
  if (
    raw.length > 4096 ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/v1/integrations/custom/oauth/callback" ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  ) {
    throw new Error("invalid 'customOAuthCallbackUrl'");
  }
  return raw;
}

export function parseCustomOAuthAttempt(value: unknown): CustomOAuthAttempt {
  if (!record(value) || Buffer.byteLength(JSON.stringify(value)) > 64 * 1024)
    throw new Error("invalid 'op.attempt'");
  const fields = [
    "slug",
    "endpoint",
    "codeVerifier",
    "redirectUri",
    "authorizationServerUrl",
  ];
  if (
    fields.some((key) => typeof value[key] !== "string" || !value[key]) ||
    !CUSTOM_SLUG.test(String(value.slug)) ||
    !record(value.client) ||
    (value.metadata !== undefined && !record(value.metadata)) ||
    (value.resource !== undefined && typeof value.resource !== "string") ||
    typeof value.expiresAtMs !== "number" ||
    !Number.isFinite(value.expiresAtMs)
  ) {
    throw new Error("invalid 'op.attempt'");
  }
  return value as unknown as CustomOAuthAttempt;
}

export function parseCustomOAuthOp(
  raw: Record<string, unknown>,
): CustomOAuthOp {
  if (raw.action === "start") {
    const slug = str(raw.slug, "op.slug");
    if (!CUSTOM_SLUG.test(slug)) throw new Error("invalid 'op.slug'");
    return {
      kind: "custom-oauth",
      action: "start",
      slug,
      callbackUrl: customOAuthCallbackUrl(raw.callbackUrl),
    };
  }
  if (raw.action === "complete") {
    const code = str(raw.code, "op.code");
    if (!code.trim() || code.length > 8192)
      throw new Error("invalid 'op.code'");
    return {
      kind: "custom-oauth",
      action: "complete",
      code,
      attempt: parseCustomOAuthAttempt(raw.attempt),
    };
  }
  throw new Error("invalid 'op.action'");
}
