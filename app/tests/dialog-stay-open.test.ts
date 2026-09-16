import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStayOpenSignal, stayOpen } from "../src/lib/dialog-stay-open.ts";

describe("the form dialog's stay-open signal", () => {
  it("rejects, which is what keeps the form on screen", async () => {
    await assert.rejects(stayOpen(), (reason: unknown) => {
      assert.ok(isStayOpenSignal(reason));
      return true;
    });
  });

  it("is recognised across module graphs, not by identity", async () => {
    // The web build composes `app/src` a second time; a `Symbol.for` marker is
    // what keeps ONE signal, where `instanceof` would see two classes.
    const marked = Object.assign(new Error("copy"), {
      [Symbol.for("houston.formDialog.stayOpen")]: true,
    });
    assert.equal(isStayOpenSignal(marked), true);
  });

  it("does not claim a real failure, which must still be reported", () => {
    assert.equal(isStayOpenSignal(new Error("engine error 500")), false);
    assert.equal(isStayOpenSignal("boom"), false);
    assert.equal(isStayOpenSignal(null), false);
  });
});
