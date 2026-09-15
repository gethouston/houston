import { podActivityStatus } from "./agents-activity";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * Pod-level busy probe: one answer for the whole host, so the control plane
 * can tell whether this pod is safe to restart (busy-aware engine rolls)
 * without enumerating agents — the waker's idle sweep stays on the per-agent
 * route. Deliberately NOT under `/agents/`: the in-flight counter server.ts
 * keeps covers only that prefix, so this probe never counts itself (no
 * self-subtraction, unlike the per-agent route).
 */
defineRoute({
  group: "pod-activity",
  method: "GET",
  path: "/activity",
  phase: "user",
  classification: "infra",
  reason:
    "Operational probe for the control plane's roll and idle sweep; no user-facing resource behind it.",
  source: "packages/host/src/routes/pod-activity.ts",
  handler: async ({ deps, res }) =>
    json(res, 200, await podActivityStatus(deps)),
});
