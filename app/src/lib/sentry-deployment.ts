// Explicit `.ts` extension: this module is exercised by the node:test runner
// (tests/sentry-deployment.test.ts), which resolves imports without a bundler.
import { isLoopbackHostUrl, type ResolvedEngine } from "./engine-mode.ts";

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
