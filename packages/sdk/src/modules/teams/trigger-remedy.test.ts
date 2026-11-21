import type {
  TriggerStatusItem,
  TriggerStatusReason,
  TriggerStatusState,
} from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { triggerRemedy } from "./trigger-remedy";

const item = (
  status: TriggerStatusState,
  reason?: TriggerStatusReason,
): TriggerStatusItem => ({
  routine_id: "r1",
  status,
  ...(reason ? { reason } : {}),
});

describe("triggerRemedy", () => {
  it("offers nothing before a status has arrived", () => {
    expect(triggerRemedy(undefined)).toBe("none");
  });

  it("offers Reconnect for a disconnected account, with or without a reason", () => {
    expect(triggerRemedy(item("paused_disconnected"))).toBe("reconnect");
    expect(triggerRemedy(item("paused_disconnected", "needs_reauth"))).toBe(
      "reconnect",
    );
  });

  it("asks for another event when the app no longer offers this one", () => {
    expect(triggerRemedy(item("error", "trigger_type_gone"))).toBe(
      "pick_another_event",
    );
  });

  it("asks to check the settings when the app refused the setup", () => {
    expect(triggerRemedy(item("error", "config_rejected"))).toBe(
      "check_settings",
    );
  });

  it("has no remedy for any other error, reasoned or not", () => {
    expect(triggerRemedy(item("error", "rejected"))).toBe("none");
    expect(triggerRemedy(item("error"))).toBe("none");
  });

  it("has no remedy for a healthy, settling or revoked binding", () => {
    for (const state of ["active", "pending", "paused_revoked"] as const)
      expect(triggerRemedy(item(state))).toBe("none");
  });

  it("never reads a reason off a status it does not belong to", () => {
    expect(triggerRemedy(item("active", "trigger_type_gone"))).toBe("none");
    expect(triggerRemedy(item("pending", "config_rejected"))).toBe("none");
  });
});
