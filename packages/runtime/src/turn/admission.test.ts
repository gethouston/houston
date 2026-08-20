import { expect, test } from "vitest";
import { AdmissionLimiter } from "./admission";

test("admission rejects work at capacity and reuses a released slot", () => {
  const limiter = new AdmissionLimiter(1);
  expect(limiter.capacity).toBe(1);
  expect(limiter.active).toBe(0);
  const release = limiter.tryAcquire();
  expect(limiter.active).toBe(1);
  expect(release).toBeTypeOf("function");
  expect(limiter.tryAcquire()).toBeNull();
  release?.();
  expect(limiter.active).toBe(0);
  expect(limiter.tryAcquire()).toBeTypeOf("function");
});

test("release is idempotent and cannot over-credit capacity", () => {
  const limiter = new AdmissionLimiter(1);
  const release = limiter.tryAcquire();
  release?.();
  release?.();
  expect(limiter.tryAcquire()).toBeTypeOf("function");
  expect(limiter.tryAcquire()).toBeNull();
});
