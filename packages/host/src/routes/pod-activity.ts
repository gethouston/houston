import { podActivityStatus } from "./agents-activity";
import { json } from "./http";
import { defineRoute } from "./registry";

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
