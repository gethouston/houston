// Resolve the gateway base URL the email-OTP endpoints (start / verify) call.
//
// A baked engine target (hosted-oauth / hosted-static / static-host, via
// `resolveEngine`) wins; otherwise the injected engine global that the web
// `CloudApp` sets synchronously; otherwise a typed throw (no silent failure —
// email sign-in is unavailable without a gateway URL). Kept out of auth.ts so
// that file stays a thin sign-in dispatcher.

import { resolveEngine } from "./engine-mode";
// Imported from the concrete module (not the ./identity barrel): the barrel
// pulls in apple-authorize, which imports THIS module for the bridge URL.
import { IdentityError } from "./identity/errors.ts";

export function gatewayUrl(): string {
  const env = import.meta.env as unknown as Parameters<typeof resolveEngine>[0];
  const resolved = resolveEngine(env);
  if (resolved.kind !== "sidecar") return resolved.url;
  const baseUrl =
    typeof window !== "undefined"
      ? window.__HOUSTON_ENGINE__?.baseUrl
      : undefined;
  if (baseUrl) return baseUrl;
  throw new IdentityError("unknown", {
    cause: new Error("email sign-in unavailable: no gateway URL configured"),
  });
}
