import { describe, expect, it, vi } from "vitest";
import { isUniqueViolation, withUniqueViolationRetry } from "./http";

/** A Postgres unique-violation as it bubbles up from the driver (SQLSTATE 23505). */
const uniqueViolation = () =>
  Object.assign(new Error("duplicate key"), { code: "23505" });

describe("isUniqueViolation", () => {
  it("matches a 23505-coded error and nothing else", () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
    expect(
      isUniqueViolation(Object.assign(new Error(), { code: "23503" })),
    ).toBe(false);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("withUniqueViolationRetry", () => {
  it("returns the value on first success without retrying", async () => {
    const op = vi.fn().mockResolvedValue("done");
    const outcome = await withUniqueViolationRetry(op);
    expect(outcome).toEqual({ ok: true, value: "done" });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries past a transient unique violation and then succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValue("recovered");
    const outcome = await withUniqueViolationRetry(op, 3);
    expect(outcome).toEqual({ ok: true, value: "recovered" });
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("gives up with { ok: false } after the bound is exhausted", async () => {
    const op = vi.fn().mockRejectedValue(uniqueViolation());
    const outcome = await withUniqueViolationRetry(op, 3);
    expect(outcome).toEqual({ ok: false });
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-unique error unchanged, without retrying", async () => {
    const op = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withUniqueViolationRetry(op)).rejects.toThrow("boom");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("respects a custom attempt bound", async () => {
    const op = vi.fn().mockRejectedValue(uniqueViolation());
    await withUniqueViolationRetry(op, 2);
    expect(op).toHaveBeenCalledTimes(2);
  });
});
