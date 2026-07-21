import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { TriggerStatusItem } from "@houston-ai/engine-client";
import {
  TRIGGER_STATUS_POLL_MS,
  triggerActivationKind,
  triggerStatusPollInterval,
  webhookActivationState,
} from "../src/components/tabs/routine-trigger-maps.ts";

const item = (
  routine_id: string,
  status: TriggerStatusItem["status"],
): TriggerStatusItem => ({ routine_id, status });

describe("triggerStatusPollInterval", () => {
  it("never polls when there are no trigger routines", () => {
    strictEqual(triggerStatusPollInterval([], null), false);
    strictEqual(triggerStatusPollInterval([], [item("r1", "pending")]), false);
  });

  it("polls while a routine has no status yet (host still resolving)", () => {
    // null: an older host feature-detected as no trigger backend.
    strictEqual(
      triggerStatusPollInterval(["r1"], null),
      TRIGGER_STATUS_POLL_MS,
    );
    // present list but this routine is missing from it.
    strictEqual(
      triggerStatusPollInterval(["r1"], [item("other", "active")]),
      TRIGGER_STATUS_POLL_MS,
    );
  });

  it("polls while any routine is pending or error", () => {
    strictEqual(
      triggerStatusPollInterval(["r1"], [item("r1", "pending")]),
      TRIGGER_STATUS_POLL_MS,
    );
    strictEqual(
      triggerStatusPollInterval(["r1"], [item("r1", "error")]),
      TRIGGER_STATUS_POLL_MS,
    );
  });

  it("polls when even one of several routines is still settling", () => {
    strictEqual(
      triggerStatusPollInterval(
        ["r1", "r2"],
        [item("r1", "active"), item("r2", "pending")],
      ),
      TRIGGER_STATUS_POLL_MS,
    );
  });

  it("stops once every routine is active", () => {
    strictEqual(
      triggerStatusPollInterval(
        ["r1", "r2"],
        [item("r1", "active"), item("r2", "active")],
      ),
      false,
    );
  });

  it("stops on a paused state — it waits on the user, not a poll", () => {
    strictEqual(
      triggerStatusPollInterval(["r1"], [item("r1", "paused_disconnected")]),
      false,
    );
    strictEqual(
      triggerStatusPollInterval(["r1"], [item("r1", "paused_revoked")]),
      false,
    );
  });
});

describe("triggerActivationKind", () => {
  it("maps a missing status to checking (never a silent blank)", () => {
    strictEqual(triggerActivationKind(undefined), "checking");
  });

  it("maps pending to activating", () => {
    strictEqual(triggerActivationKind(item("r1", "pending")), "activating");
  });

  it("maps active to active", () => {
    strictEqual(triggerActivationKind(item("r1", "active")), "active");
  });

  it("maps every needs-the-user state to alert", () => {
    strictEqual(
      triggerActivationKind(item("r1", "paused_disconnected")),
      "alert",
    );
    strictEqual(triggerActivationKind(item("r1", "paused_revoked")), "alert");
    strictEqual(triggerActivationKind(item("r1", "error")), "alert");
  });
});

describe("webhookActivationState", () => {
  it("maps a missing status to checking (never a silent blank)", () => {
    strictEqual(webhookActivationState(undefined), "checking");
  });

  it("maps pending to needs_key — the mint call to action, not a spinner", () => {
    strictEqual(webhookActivationState(item("r1", "pending")), "needs_key");
  });

  it("maps active to active", () => {
    strictEqual(webhookActivationState(item("r1", "active")), "active");
  });

  it("maps any other server state to alert", () => {
    strictEqual(webhookActivationState(item("r1", "error")), "alert");
    strictEqual(
      webhookActivationState(item("r1", "paused_disconnected")),
      "alert",
    );
  });
});
