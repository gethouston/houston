import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { TriggerStatusItem } from "@houston/engine-adapter";
import { activationAlertView } from "../src/components/agent/routine-activation-alert-view.ts";
import en from "../src/locales/en/routines.json" with { type: "json" };
import es from "../src/locales/es/routines.json" with { type: "json" };
import pt from "../src/locales/pt/routines.json" with { type: "json" };

const SRC = join(import.meta.dirname, "../src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const item = (
  status: TriggerStatusItem["status"],
  extra: Partial<TriggerStatusItem> = {},
): TriggerStatusItem => ({ routine_id: "r1", status, ...extra });

describe("activationAlertView", () => {
  it("offers Reconnect for a disconnected account", () => {
    deepStrictEqual(
      activationAlertView(
        item("paused_disconnected", { reason: "needs_reauth" }),
      ),
      {
        labelKey: "trigger.status.paused_disconnected",
        detail: { kind: "hint", key: "trigger.statusDisconnectedHint" },
        showReconnect: true,
      },
    );
  });

  it("asks for another event, without Reconnect, when the event is gone", () => {
    deepStrictEqual(
      activationAlertView(
        item("error", {
          reason: "trigger_type_gone",
          detail: "Trigger type GMAIL_NEW_GMAIL_MESSAGE not found",
        }),
      ),
      {
        labelKey: "trigger.status.error",
        detail: { kind: "hint", key: "trigger.statusTriggerGoneHint" },
        showReconnect: false,
      },
    );
  });

  it("asks to check the settings when the app refused the setup", () => {
    deepStrictEqual(
      activationAlertView(
        item("error", { reason: "config_rejected", detail: "Missing secret" }),
      ),
      {
        labelKey: "trigger.status.error",
        detail: { kind: "hint", key: "trigger.statusConfigRejectedHint" },
        showReconnect: false,
      },
    );
  });

  it("keeps the host's detail, without Reconnect, for any other error", () => {
    for (const reason of [undefined, "rejected"] as const) {
      const view = activationAlertView(
        item("error", { reason, detail: "Delivery is failing." }),
      );
      deepStrictEqual(view.detail, {
        kind: "server",
        text: "Delivery is failing.",
      });
      strictEqual(view.showReconnect, false);
    }
  });

  it("explains a revoked app without offering Reconnect", () => {
    const view = activationAlertView(item("paused_revoked"));
    strictEqual(view.labelKey, "trigger.status.paused_revoked");
    deepStrictEqual(view.detail, {
      kind: "hint",
      key: "trigger.statusRevokedHint",
    });
    strictEqual(view.showReconnect, false);
  });
});

describe("the chip renders the alert, and the locales carry the copy", () => {
  it("routes the alert block through the extracted component", () => {
    ok(
      read("components/agent/routine-activation-chip.tsx").includes(
        "<RoutineActivationAlert status={status} onReconnect={onReconnect} />",
      ),
    );
    const alert = read("components/agent/routine-activation-alert.tsx");
    ok(alert.includes("activationAlertView(status)"));
    ok(alert.includes("view.showReconnect &&"));
  });

  it("en, es and pt carry both hints, without em dashes", () => {
    for (const [lang, bundle] of Object.entries({ en, es, pt })) {
      const trigger = (bundle as { trigger: Record<string, unknown> }).trigger;
      for (const key of ["statusTriggerGoneHint", "statusConfigRejectedHint"]) {
        const value = trigger[key];
        ok(typeof value === "string" && value.length > 0, `${lang}: ${key}`);
        ok(!value.includes("—"), `${lang}: ${key} has an em dash`);
      }
    }
  });
});
