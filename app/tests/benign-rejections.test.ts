import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isBenignLockRejection } from "../src/lib/benign-rejections.ts";

/**
 * auth-js's typed acquire-timeout error, reduced to the shape our predicate
 * reads: an Error subclass carrying `isAcquireTimeout === true`.
 */
function acquireTimeoutError(message: string): Error {
  return Object.assign(new Error(message), { isAcquireTimeout: true });
}

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
        new Error('Lock "sb-auth-token" was released because another request stole it'),
      ),
      true,
    );
  });

  it("matches any auth-js error flagged isAcquireTimeout, regardless of message", () => {
    strictEqual(
      isBenignLockRejection(acquireTimeoutError("Acquiring an exclusive lock timed out")),
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
      isBenignLockRejection(Object.assign(new Error("x"), { isAcquireTimeout: "yes" })),
      false,
    );
  });

  it("handles non-object reasons safely", () => {
    strictEqual(isBenignLockRejection(null), false);
    strictEqual(isBenignLockRejection(undefined), false);
    strictEqual(isBenignLockRejection("Lock was stolen by another request"), false);
    strictEqual(isBenignLockRejection(42), false);
  });

  it("handles an object with no message", () => {
    strictEqual(isBenignLockRejection({}), false);
    strictEqual(isBenignLockRejection({ message: 123 }), false);
  });
});
