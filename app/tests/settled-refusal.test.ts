import { doesNotThrow, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { throwFirstRefusal } from "../src/lib/settled-refusal.ts";
import { markToldUser } from "../src/lib/user-told-mark.ts";

const ok = (value: unknown): PromiseSettledResult<unknown> => ({
  status: "fulfilled",
  value,
});
const no = (reason: unknown): PromiseSettledResult<unknown> => ({
  status: "rejected",
  reason,
});
const told = (message: string) => {
  const err = new Error(message);
  markToldUser(err);
  return err;
};
const warming = () =>
  Object.assign(new Error("almost ready"), { name: "AgentWarmingError" });

function thrown(settled: PromiseSettledResult<unknown>[]): unknown {
  try {
    throwFirstRefusal(settled);
  } catch (err) {
    return err;
  }
  throw new Error("expected a throw");
}

describe("throwFirstRefusal", () => {
  it("returns when every write landed (or there were none)", () => {
    doesNotThrow(() => throwFirstRefusal([ok(1), ok(2)]));
    doesNotThrow(() => throwFirstRefusal([]));
  });

  it("rethrows an already-told refusal itself, keeping its mark", () => {
    const offline = told("offline");
    strictEqual(thrown([ok(1), no(offline), no(told("waking"))]), offline);
  });

  it("rethrows the warming refusal itself", () => {
    const err = warming();
    strictEqual(thrown([no(err), ok(1)]), err);
  });

  it("an unexplained failure wins over explained ones, with its own stack", () => {
    const boom = new Error("boom");
    strictEqual(thrown([no(told("offline")), no(warming()), no(boom)]), boom);
  });

  it("the first unexplained failure wins among several", () => {
    const first = new Error("first");
    strictEqual(thrown([no(first), no(new Error("second"))]), first);
  });

  it("a non-Error reason still throws as itself", () => {
    throws(
      () => throwFirstRefusal([no("nope")]),
      (err) => err === "nope",
    );
  });
});
