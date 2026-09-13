// Explicit `.ts` extension: this module is exercised by the node:test runner
// (tests/sentry-deployment.test.ts), which resolves imports without a bundler.
import {
  isLoopbackHostUrl,
  type ResolvedEngine,
  resolveEngine,
} from "./engine-mode.ts";

/**
 * Which Houston deployment this CLIENT belongs to — the same vocabulary the
 * engine tags its own events with (`packages/runtime-client/src/sentry/
 * activation.ts` EngineDeployment), so ONE Sentry filter spans a deployment's
 * whole stack: `deployment:managed-cloud` returns the cloud pods' errors AND
 * the errors users hit in an app talking to those pods.
 *
 * Without this, cloud-side client failures (a 502 from the gateway, an agent
 * that never woke) were only findable by knowing the internal name of the
 * function that throws them — the surface a user actually experiences was the
 * hardest half of the cloud product to query.
 *
 * `dev` is deliberately NOT a value: the client already reports its dev-ness in
 * the `environment` tag, and a developer pointing at a hosted gateway is still
 * exercising the managed-cloud topology.
 */
export type ClientDeployment = "managed-cloud" | "desktop" | "selfhost";

const VALID: ReadonlySet<string> = new Set<ClientDeployment>([
  "managed-cloud",
  "desktop",
  "selfhost",
]);

/**
 * Resolve the client's deployment. Pure — the caller supplies the resolved
 * engine target and the optional runtime override.
 *
 * - `override` is `window.__HOUSTON_DEPLOYMENT__`, published by the web build
 *   before the app graph loads (`packages/web/src/main.tsx`): one web bundle
 *   serves both the cloud site and a self-host Connect screen, so only it can
 *   know which one this tab is. An unrecognized value is ignored rather than
 *   trusted — the tag must never carry arbitrary strings.
 * - a hosted gateway (desktop cloud build) is `managed-cloud`.
 * - an explicit host URL is `selfhost`, unless it is loopback — that is the
 *   dev two-terminal setup against a co-located host, i.e. `desktop`.
 * - no flags at all is the Tauri-spawned sidecar: `desktop`.
 */
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

/**
 * This build's deployment, from the live build flags plus the web build's
 * window override — the one impure entry point, so the resolver above stays
 * pure for tests.
 *
 * It is the only honest answer to "is this client part of the managed cloud?":
 * the desktop cloud build says so through its baked gateway URL, while the
 * cloud WEB app bakes no gateway at all (it injects `window.__HOUSTON_ENGINE__`
 * from `VITE_CONTROL_PLANE_URL` and announces itself on the override), so a
 * check against the engine flags alone would answer "no" for every browser user
 * of the managed cloud.
 */
export function currentClientDeployment(): ClientDeployment {
  return resolveClientDeployment({
    // Same cast engine.ts uses: the generated ImportMetaEnv type doesn't
    // structurally match the flags EngineModeEnv declares.
    engine: resolveEngine(
      (import.meta.env ?? {}) as unknown as Parameters<typeof resolveEngine>[0],
    ),
    override:
      typeof window !== "undefined" ? window.__HOUSTON_DEPLOYMENT__ : undefined,
  });
}
