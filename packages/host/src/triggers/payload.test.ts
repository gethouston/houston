import { expect, test } from "vitest";
import { MAX_PAYLOAD_BYTES, truncateEventPayload } from "./payload";

test("small payloads pass through untouched", () => {
  const data = { subject: "hi", from: "a@b.com" };
  expect(truncateEventPayload(data)).toBe(data);
});

test("an oversized payload is replaced by a bounded truncation marker", () => {
  const big = { blob: "x".repeat(MAX_PAYLOAD_BYTES * 2) };
  const out = truncateEventPayload(big) as {
    _truncated: boolean;
    _bytes: number;
    preview: string;
  };
  expect(out._truncated).toBe(true);
  expect(out._bytes).toBeGreaterThan(MAX_PAYLOAD_BYTES);
  // The stored marker itself stays within the byte ceiling.
  expect(Buffer.byteLength(JSON.stringify(out), "utf8")).toBeLessThanOrEqual(
    MAX_PAYLOAD_BYTES,
  );
});

test("null/undefined data does not throw", () => {
  expect(truncateEventPayload(undefined)).toBe(undefined);
  expect(truncateEventPayload(null)).toBe(null);
});
