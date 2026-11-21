import {
  isLoopbackHostUrl,
  type ResolvedEngine,
  resolveEngine,
} from "./engine-mode.ts";

export type ClientDeployment = "managed-cloud" | "desktop" | "selfhost";

const VALID: ReadonlySet<string> = new Set<ClientDeployment>([
  "managed-cloud",
  "desktop",
  "selfhost",
]);

export function resolveClientDeployment(input: {
  engine: ResolvedEngine;
  override?: string | undefined;
}): ClientDeployment {
  const { engine, override } = input;
  if (override && VALID.has(override)) return override as ClientDeployment;
  switch (engine.kind) {
    case "hosted-oauth":
    case "hosted-static":
      return "managed-cloud";
    case "static-host":
      return isLoopbackHostUrl(engine.url) ? "desktop" : "selfhost";
    default:
      return "desktop";
  }
}

export function currentClientDeployment(): ClientDeployment {
  return resolveClientDeployment({
    engine: resolveEngine(
      (import.meta.env ?? {}) as unknown as Parameters<typeof resolveEngine>[0],
    ),
    override:
      typeof window !== "undefined" ? window.__HOUSTON_DEPLOYMENT__ : undefined,
  });
}
