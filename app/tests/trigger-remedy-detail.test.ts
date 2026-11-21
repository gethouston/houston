import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { TriggerStatusItem } from "@houston/engine-adapter";
import {
  remedyHintKey,
  withRemedyDetail,
  withRemedyDetails,
} from "../src/components/agent/trigger-remedy-detail.ts";

const SRC = join(import.meta.dirname, "../src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const translate = (key: string) => `t:${key}`;

const item = (
  routine_id: string,
  status: TriggerStatusItem["status"],
  extra: Partial<TriggerStatusItem> = {},
): TriggerStatusItem => ({ routine_id, status, ...extra });

describe("remedyHintKey", () => {
  it("names copy only for the remedies the host's detail cannot", () => {
    strictEqual(
      remedyHintKey("pick_another_event"),
      "trigger.statusTriggerGoneHint",
    );
    strictEqual(
      remedyHintKey("check_settings"),
      "trigger.statusConfigRejectedHint",
    );
    strictEqual(remedyHintKey("reconnect"), null);
    strictEqual(remedyHintKey("none"), null);
  });
});

describe("withRemedyDetail", () => {
  it("replaces the host's English detail with the authored copy", () => {
    deepStrictEqual(
      withRemedyDetail(
        item("r1", "error", { reason: "trigger_type_gone", detail: "404" }),
        translate,
      ),
      {
        routine_id: "r1",
        status: "error",
        reason: "trigger_type_gone",
        detail: "t:trigger.statusTriggerGoneHint",
      },
    );
    strictEqual(
      withRemedyDetail(
        item("r1", "error", { reason: "config_rejected" }),
        translate,
      ).detail,
      "t:trigger.statusConfigRejectedHint",
    );
  });

  it("leaves every other item as it is", () => {
    for (const status of [
      item("r1", "error", { detail: "Delivery is failing." }),
      item("r1", "error", { reason: "rejected", detail: "Refused." }),
      item("r1", "paused_disconnected", { reason: "needs_reauth" }),
      item("r1", "active"),
    ])
      strictEqual(withRemedyDetail(status, translate), status);
  });
});

describe("withRemedyDetails", () => {
  it("rewrites only the rows with a remedy and keeps the map when none has one", () => {
    const healthy = { r1: item("r1", "active") };
    strictEqual(withRemedyDetails(healthy, translate), healthy);

    const mixed = {
      r1: item("r1", "active"),
      r2: item("r2", "error", { reason: "config_rejected", detail: "x" }),
    };
    const out = withRemedyDetails(mixed, translate);
    strictEqual(out.r1, mixed.r1);
    strictEqual(out.r2.detail, "t:trigger.statusConfigRejectedHint");
    strictEqual(mixed.r2.detail, "x");
  });

  it("feeds the grid and the chip from the same mapping", () => {
    const viewModel = read("components/agent/trigger-status-view-model.ts");
    strictEqual(viewModel.includes("withRemedyDetails(timedStatuses"), true);
    const chip = read("components/agent/routine-activation-alert-view.ts");
    strictEqual(chip.includes("remedyHintKey(remedy)"), true);
  });
});
