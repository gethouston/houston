import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getSessionStatusKey,
  isActiveSessionStatus,
  useSessionStatusStore,
} from "../src/stores/session-status.ts";

describe("session status store", () => {
  it("clears transient session status after engine restart", () => {
    const key = getSessionStatusKey("C:/agent", "activity-1");

    useSessionStatusStore
      .getState()
      .setStatus("C:/agent", "activity-1", "running");
    strictEqual(useSessionStatusStore.getState().statuses[key], "running");

    useSessionStatusStore.getState().clearAll();

    deepStrictEqual(useSessionStatusStore.getState().statuses, {});
  });

  it("treats only starting and running as active", () => {
    strictEqual(isActiveSessionStatus("starting"), true);
    strictEqual(isActiveSessionStatus("running"), true);
    strictEqual(isActiveSessionStatus("completed"), false);
    strictEqual(isActiveSessionStatus("error"), false);
    strictEqual(isActiveSessionStatus(undefined), false);
  });
});
