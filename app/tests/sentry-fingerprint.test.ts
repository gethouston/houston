import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeFingerprintMessage,
  fingerprintForEvent,
} from "../src/lib/sentry-fingerprint.ts";

// These helpers back Houston's Sentry issue dedup (HOU-449): renderer errors
// carry the local sidecar's RANDOM port in their message, so without a stable
// fingerprint one transport drop fans out into a new Sentry issue per port.
// Pin the normalization so a regression can't reintroduce the duplicate sprawl.

describe("normalizeFingerprintMessage", () => {
  it("collapses the random sidecar port so transport drops share one key", () => {
    const a = normalizeFingerprintMessage("Failed to fetch (127.0.0.1:56736)");
    const b = normalizeFingerprintMessage("Failed to fetch (127.0.0.1:61449)");
    assert.equal(a, b);
    assert.equal(a, "Failed to fetch ({addr})");
  });

  it("keeps distinct failure strings separate", () => {
    assert.notEqual(
      normalizeFingerprintMessage("Failed to fetch (127.0.0.1:1)"),
      normalizeFingerprintMessage("Load failed (127.0.0.1:1)"),
    );
  });

  it("uses only the first line (drops appended raw payloads)", () => {
    const key = normalizeFingerprintMessage(
      "internal: composio link --no-wait output: expected value at line 1 column 1\nstdout: {...}",
    );
    assert.equal(
      key,
      "internal: composio link --no-wait output: expected value at line {n} column {n}",
    );
    assert.ok(!key.includes("stdout"));
  });

  it("masks UUIDs and hex status codes", () => {
    assert.equal(
      normalizeFingerprintMessage(
        "complete_composio_login: timed out args=[login, cf7f2461-f693-4f65-95bf-6d110f1d4344]",
      ),
      "complete_composio_login: timed out args=[login, {uuid}]",
    );
    assert.equal(
      normalizeFingerprintMessage("exited with exit code: 0xc000001d."),
      "exited with exit code: {hex}.",
    );
  });

  it("caps the key length", () => {
    assert.equal(normalizeFingerprintMessage("x".repeat(500)).length, 200);
  });
});

describe("fingerprintForEvent", () => {
  it("prefers the exception value and returns a one-element fingerprint", () => {
    const fp = fingerprintForEvent({
      exception: { values: [{ value: "read_agent_file failed" }, { value: "Load failed (127.0.0.1:57461)" }] },
      message: "ignored when an exception is present",
    });
    assert.deepEqual(fp, ["Load failed ({addr})"]);
  });

  it("falls back to the bare message", () => {
    assert.deepEqual(
      fingerprintForEvent({ message: "houston-engine subprocess exited (15)" }),
      ["houston-engine subprocess exited ({n})"],
    );
  });

  it("returns undefined when there is no usable message", () => {
    assert.equal(fingerprintForEvent({}), undefined);
    assert.equal(fingerprintForEvent({ message: "   " }), undefined);
    assert.equal(fingerprintForEvent({ exception: { values: [] } }), undefined);
  });

  it("gives two different-port events the same fingerprint", () => {
    const a = fingerprintForEvent({ exception: { values: [{ value: "list_skills: Failed to fetch (127.0.0.1:60248)" }] } });
    const b = fingerprintForEvent({ exception: { values: [{ value: "list_skills: Failed to fetch (127.0.0.1:51449)" }] } });
    assert.deepEqual(a, b);
  });
});
