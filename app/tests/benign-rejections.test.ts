import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isBenignAbortRejection,
  isBenignLockRejection,
} from "../src/lib/benign-rejections.ts";

/**
 * auth-js's typed acquire-timeout error, reduced to the shape our predicate
 * reads: an Error subclass carrying `isAcquireTimeout === true`.
 */
function acquireTimeoutError(message: string): Error {
  return Object.assign(new Error(message), { isAcquireTimeout: true });
}

/** WebKit's internal abort rejection, reduced to the shape the predicate reads. */
function webkitAbortError(): unknown {
  return Object.assign(new Error("Fetch is aborted"), { name: "AbortError" });
}

describe("isBenignAbortRejection", () => {
  it("matches WebKit's abort-time AbortError (HOUSTON-APP-4ZZ / 4Z3)", () => {
    strictEqual(isBenignAbortRejection(webkitAbortError()), true);
  });

  it("is case-insensitive on the message", () => {
    strictEqual(
      isBenignAbortRejection(
        Object.assign(new Error("FETCH IS ABORTED"), { name: "AbortError" }),
      ),
      true,
    );
  });

  it("does NOT match other AbortError phrasings (a floating abort in our code is a bug)", () => {
    strictEqual(
      isBenignAbortRejection(
        Object.assign(new Error("The operation was aborted."), {
          name: "AbortError",
        }),
      ),
      false,
    );
    strictEqual(
      isBenignAbortRejection(
        Object.assign(new Error("signal is aborted without reason"), {
          name: "AbortError",
        }),
      ),
      false,
    );
  });

  it("does NOT match the message without the AbortError name", () => {
    strictEqual(isBenignAbortRejection(new Error("Fetch is aborted")), false);
  });

  it("handles non-object reasons safely", () => {
    strictEqual(isBenignAbortRejection(null), false);
    strictEqual(isBenignAbortRejection(undefined), false);
    strictEqual(isBenignAbortRejection("Fetch is aborted"), false);
    strictEqual(isBenignAbortRejection({}), false);
  });
});

describe("isBenignLockRejection", () => {
  it("matches the raw Web Locks 'stolen' DOMException (HOUSTON-APP-8Y)", () => {
    strictEqual(
      isBenignLockRejection(new Error("Lock was stolen by another request")),
      true,
    );
  });

  it("matches the raw Web Locks 'broken … steal' DOMException (dup APP-6Q)", () => {
    strictEqual(
      isBenignLockRejection(
        new Error("Lock broken by another request with the 'steal' option"),
      ),
      true,
    );
  });

  it("matches auth-js's wrapped 'another request stole it' message", () => {
    strictEqual(
      isBenignLockRejection(
        new Error(
          'Lock "sb-auth-token" was released because another request stole it',
        ),
      ),
      true,
    );
  });

  it("matches any auth-js error flagged isAcquireTimeout, regardless of message", () => {
    strictEqual(
      isBenignLockRejection(
        acquireTimeoutError("Acquiring an exclusive lock timed out"),
      ),
      true,
    );
  });

  it("is case-insensitive on the message", () => {
    strictEqual(
      isBenignLockRejection(new Error("LOCK WAS STOLEN BY ANOTHER REQUEST")),
      true,
    );
  });

  it("does NOT match an unrelated error that merely mentions a lock", () => {
    strictEqual(
      isBenignLockRejection(new Error("Failed to lock the keychain item")),
      false,
    );
  });

  it("does NOT match a generic application error", () => {
    strictEqual(
      isBenignLockRejection(new Error("Network request failed")),
      false,
    );
  });

  it("does NOT match isAcquireTimeout when it is not strictly true", () => {
    strictEqual(
      isBenignLockRejection(
        Object.assign(new Error("x"), { isAcquireTimeout: "yes" }),
      ),
      false,
    );
  });

  it("handles non-object reasons safely", () => {
    strictEqual(isBenignLockRejection(null), false);
    strictEqual(isBenignLockRejection(undefined), false);
    strictEqual(
      isBenignLockRejection("Lock was stolen by another request"),
      false,
    );
    strictEqual(isBenignLockRejection(42), false);
  });

  it("handles an object with no message", () => {
    strictEqual(isBenignLockRejection({}), false);
    strictEqual(isBenignLockRejection({ message: 123 }), false);
  });
});
