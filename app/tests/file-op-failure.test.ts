import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  planFileOpFailure,
  toFileOpFailure,
} from "../src/lib/file-op-failure.ts";

// PRODUCT-1732: the shell's save / reveal commands reject with a typed
// failure; the OS states a user can fix become informational copy with no
// Sentry report, and only `other` still goes down the report path.
describe("toFileOpFailure", () => {
  it("reads the shell's typed rejection", () => {
    deepStrictEqual(
      toFileOpFailure({
        kind: "locked",
        message:
          "Failed to save file: El proceso no tiene acceso al archivo porque está siendo utilizado por otro proceso. (os error 32)",
      }),
      {
        kind: "locked",
        message:
          "Failed to save file: El proceso no tiene acceso al archivo porque está siendo utilizado por otro proceso. (os error 32)",
      },
    );
  });

  it("wraps a plain string (an older command, a dialog failure) as `other`", () => {
    deepStrictEqual(
      toFileOpFailure("Failed to open save dialog: program not found"),
      {
        kind: "other",
        message: "Failed to open save dialog: program not found",
      },
    );
  });

  it("wraps a thrown Error and an unknown kind as `other`", () => {
    strictEqual(toFileOpFailure(new Error("boom")).kind, "other");
    strictEqual(
      toFileOpFailure({ kind: "teapot", message: "x" }).kind,
      "other",
    );
  });
});

describe("planFileOpFailure", () => {
  it("a locked save is an expected state with the locked copy", () => {
    const plan = planFileOpFailure("save", {
      kind: "locked",
      message: "os error 32",
    });
    strictEqual(plan.surface, "expected");
    strictEqual(plan.surface === "expected" && plan.copy, "saveLocked");
  });

  it("a protected folder and a full disk are expected save states", () => {
    const denied = planFileOpFailure("save", {
      kind: "permission",
      message: "os error 5",
    });
    strictEqual(denied.surface === "expected" && denied.copy, "savePermission");
    const full = planFileOpFailure("save", {
      kind: "disk_full",
      message: "os error 112",
    });
    strictEqual(full.surface === "expected" && full.copy, "saveDiskFull");
  });

  it("Explorer refusing to launch is the one expected reveal state", () => {
    // HOUSTON-APP-5C6: "Failed to reveal path: Access is denied. (os error 5)".
    const denied = planFileOpFailure("reveal", {
      kind: "permission",
      message: "os error 5",
    });
    strictEqual(
      denied.surface === "expected" && denied.copy,
      "revealPermission",
    );
    strictEqual(
      planFileOpFailure("reveal", { kind: "locked", message: "" }).surface,
      "report",
    );
    strictEqual(
      planFileOpFailure("reveal", { kind: "disk_full", message: "" }).surface,
      "report",
    );
  });

  it("`other` and untyped rejections still report", () => {
    strictEqual(
      planFileOpFailure("save", { kind: "other", message: "x" }).surface,
      "report",
    );
    strictEqual(planFileOpFailure("save", "raw string").surface, "report");
    strictEqual(
      planFileOpFailure("reveal", new Error("boom")).surface,
      "report",
    );
  });

  it("keeps the raw diagnostic on the plan for the frontend log", () => {
    const plan = planFileOpFailure("save", {
      kind: "locked",
      message: "os error 32",
    });
    strictEqual(plan.failure.message, "os error 32");
  });
});
