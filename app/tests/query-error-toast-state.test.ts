import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  deriveCatalogFailure,
  EMPTY_CATALOG_FAILURE,
  nextErrorToastState,
} from "../src/hooks/query-error-toast-state.ts";

// The pure decision logic shared by `useQueryErrorToast` (capabilities +
// provider-catalog). Kept framework-free so these semantics are testable
// without a React renderer or the error-toast import chain.

describe("nextErrorToastState: once per distinct failure, reset on recovery", () => {
  it("does not toast while the query is not failing, and clears the ref", () => {
    deepStrictEqual(nextErrorToastState("something", false, undefined), {
      shouldToast: false,
      reported: null,
    });
  });

  it("toasts the first time a failure identity is seen", () => {
    const err = new Error("boom");
    deepStrictEqual(nextErrorToastState(null, true, err), {
      shouldToast: true,
      reported: err,
    });
  });

  it("stays silent while the SAME failure identity persists (no spam)", () => {
    const err = new Error("boom");
    deepStrictEqual(nextErrorToastState(err, true, err), {
      shouldToast: false,
      reported: err,
    });
  });

  it("toasts again when a NEW distinct error replaces the old one", () => {
    const first = new Error("first");
    const second = new Error("second");
    deepStrictEqual(nextErrorToastState(first, true, second), {
      shouldToast: true,
      reported: second,
    });
  });

  it("re-toasts an identical identity after a recovery cleared the ref", () => {
    const err = new Error("flaky");
    // Fail → toast, remember `err`.
    const failed = nextErrorToastState(null, true, err);
    strictEqual(failed.shouldToast, true);
    // Recover → ref cleared to null.
    const recovered = nextErrorToastState(failed.reported, false, undefined);
    strictEqual(recovered.reported, null);
    // Fail again with the same identity → toasts, because the ref was reset.
    deepStrictEqual(nextErrorToastState(recovered.reported, true, err), {
      shouldToast: true,
      reported: err,
    });
  });
});

describe("deriveCatalogFailure: empty 200 surfaces as a failure", () => {
  const ok = { isError: false, error: null, isSuccess: true } as const;

  it("is not a failure while still loading (no success, no error, no data)", () => {
    deepStrictEqual(
      deriveCatalogFailure({
        isError: false,
        error: null,
        isSuccess: false,
        count: 0,
      }),
      { isFailure: false, identity: null },
    );
  });

  it("is not a failure for a healthy non-empty catalog", () => {
    deepStrictEqual(deriveCatalogFailure({ ...ok, count: 35 }), {
      isFailure: false,
      identity: null,
    });
  });

  it("treats a 200 with an empty catalog as a failure keyed on the sentinel", () => {
    deepStrictEqual(deriveCatalogFailure({ ...ok, count: 0 }), {
      isFailure: true,
      identity: EMPTY_CATALOG_FAILURE,
    });
  });

  it("gives the empty-catalog failure a STABLE identity across occurrences", () => {
    const a = deriveCatalogFailure({ ...ok, count: 0 });
    const b = deriveCatalogFailure({ ...ok, count: 0 });
    // Same reference → the dedupe hook toasts it once, not on every re-render.
    strictEqual(a.identity, b.identity);
    // And it flows through the toast reducer exactly once.
    const first = nextErrorToastState(null, a.isFailure, a.identity);
    strictEqual(first.shouldToast, true);
    strictEqual(
      nextErrorToastState(first.reported, b.isFailure, b.identity).shouldToast,
      false,
    );
  });

  it("keys a real query error on the error object (not the empty sentinel)", () => {
    const error = new Error("engine error 500");
    deepStrictEqual(
      deriveCatalogFailure({
        isError: true,
        error,
        isSuccess: false,
        count: 0,
      }),
      { isFailure: true, identity: error },
    );
  });
});
