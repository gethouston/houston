import { resolveEngine } from "./engine-mode";
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
