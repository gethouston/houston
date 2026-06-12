import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { engineCallSurface } from "../src/lib/engine-call-policy.ts";

describe("engineCallSurface", () => {
  it("toasts and captures by default", () => {
    deepStrictEqual(engineCallSurface(undefined), { toast: true, capture: true });
    deepStrictEqual(engineCallSurface("HoustonEngineError"), { toast: true, capture: true });
  });

  it("suppresses the toast but STILL captures when toast:false", () => {
    // The contract behind the provider-login double-toast fix: the picker /
    // settings / Gemini dialog render their own failure toast, so `call` must
    // not toast on top — but the failure must still reach Sentry. Suppressing
    // the toast must never become a silent failure.
    deepStrictEqual(engineCallSurface(undefined, { toast: false }), {
      toast: false,
      capture: true,
    });
  });

  it("suppresses capture independently when capture:false", () => {
    deepStrictEqual(engineCallSurface(undefined, { capture: false }), {
      toast: true,
      capture: false,
    });
  });

  it("does nothing when both are suppressed", () => {
    deepStrictEqual(engineCallSurface(undefined, { toast: false, capture: false }), {
      toast: false,
      capture: false,
    });
  });

  it("treats AbortError as expected — never toasts or captures, ignoring options", () => {
    deepStrictEqual(engineCallSurface("AbortError"), { toast: false, capture: false });
    // Even if a caller asked to toast, an abort stays silent.
    deepStrictEqual(engineCallSurface("AbortError", { toast: true, capture: true }), {
      toast: false,
      capture: false,
    });
  });
});
