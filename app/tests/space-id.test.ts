import assert from "node:assert/strict";
import test from "node:test";
import {
  isTeamWorkspace,
  orgSlugFromWorkspaceId,
} from "../src/lib/space-id.ts";

test("extracts the slug from a valid org workspace id", () => {
  assert.equal(
    orgSlugFromWorkspaceId("org:0123456789abcdef"),
    "0123456789abcdef",
  );
  assert.equal(
    orgSlugFromWorkspaceId("org:ffffffffffffffff"),
    "ffffffffffffffff",
  );
  assert.equal(
    orgSlugFromWorkspaceId("org:a1b2c3d4e5f60718"),
    "a1b2c3d4e5f60718",
  );
});

test("isTeamWorkspace tracks a valid org id", () => {
  assert.equal(isTeamWorkspace("org:0123456789abcdef"), true);
  assert.equal(isTeamWorkspace("org:ffffffffffffffff"), true);
});

test("personal (opaque, non-org) ids map to null / not-a-team", () => {
  for (const id of [
    "ws_9c2f", // legacy opaque personal id
    "default",
    "6f3c9a1e-2b4d-4c8a-9e1f-0a2b3c4d5e6f", // uuid
    "personal",
    "",
  ]) {
    assert.equal(orgSlugFromWorkspaceId(id), null, id);
    assert.equal(isTeamWorkspace(id), false, id);
  }
});

test("malicious / near-miss lookalikes are rejected", () => {
  for (const id of [
    "org:", // empty slug
    "org:xyz", // non-hex, too short
    "org:0123456789ABCDEF", // uppercase hex not allowed
    "org:0123456789abcde", // 15 chars — too short
    "org:0123456789abcdef0", // 17 chars — too long
    "org:0123456789abcdefg", // 16 chars but g is not hex
    " org:0123456789abcdef", // leading space
    "org:0123456789abcdef ", // trailing space
    "xorg:0123456789abcdef", // prefix must be exact
    "org:0123456789abcdef\n", // trailing newline (anchors are absolute)
    "org::0123456789abcdef", // doubled separator
    "ORG:0123456789abcdef", // uppercase prefix
  ]) {
    assert.equal(orgSlugFromWorkspaceId(id), null, JSON.stringify(id));
    assert.equal(isTeamWorkspace(id), false, JSON.stringify(id));
  }
});
