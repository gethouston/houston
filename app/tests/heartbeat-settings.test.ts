import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { planInvalidation } from "../src/lib/agent-invalidation-plan.ts";
import {
  formatHeartbeatTime,
  heartbeatTimeOptions,
} from "../src/lib/heartbeat-times.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

describe("morning briefing time picker", () => {
  it("offers every hour of the day", () => {
    const options = heartbeatTimeOptions("08:00");
    strictEqual(options.length, 24);
    strictEqual(options[0], "00:00");
    strictEqual(options[23], "23:00");
  });

  it("keeps a saved time that is not on the hour, in order", () => {
    const options = heartbeatTimeOptions("07:30");
    strictEqual(options.length, 25);
    deepStrictEqual(options.slice(7, 10), ["07:00", "07:30", "08:00"]);
  });

  it("writes the time the way the person's locale does", () => {
    // ICU versions differ on the space before AM/PM (a narrow no-break one).
    const en = (time: string) =>
      formatHeartbeatTime(time, "en-US").replace(/\s/g, " ");
    strictEqual(en("08:00"), "8:00 AM");
    strictEqual(en("19:30"), "7:30 PM");
    ok(formatHeartbeatTime("19:30", "pt-BR").startsWith("19:30"));
  });
});

describe("morning briefing reactivity", () => {
  it("HeartbeatChanged refreshes the settings row whatever space is open", () => {
    const plan = planInvalidation(
      { type: "HeartbeatChanged", data: { workspace_id: "Personal" } },
      { workspaceId: "another" },
    );
    deepStrictEqual(plan.invalidate, [queryKeys.heartbeat()]);
  });

  it("HeartbeatDelivered is a ping, not a cache change", () => {
    const plan = planInvalidation(
      {
        type: "HeartbeatDelivered",
        data: { agent_path: "Personal/.assistant" },
      },
      { workspaceId: "Personal" },
    );
    deepStrictEqual(plan.invalidate, []);
    deepStrictEqual(plan.patchAllConversations, []);
  });
});
