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
    "ws_9c2f",
    "default",
    "6f3c9a1e-2b4d-4c8a-9e1f-0a2b3c4d5e6f",
    "personal",
    "",
  ]) {
    assert.equal(orgSlugFromWorkspaceId(id), null, id);
    assert.equal(isTeamWorkspace(id), false, id);
  }
});

test("malicious / near-miss lookalikes are rejected", () => {
  for (const id of [
    "org:",
    "org:xyz",
    "org:0123456789ABCDEF",
    "org:0123456789abcde",
    "org:0123456789abcdef0",
    "org:0123456789abcdefg",
    " org:0123456789abcdef",
    "org:0123456789abcdef ",
    "xorg:0123456789abcdef",
    "org:0123456789abcdef\n",
    "org::0123456789abcdef",
    "ORG:0123456789abcdef",
  ]) {
    assert.equal(orgSlugFromWorkspaceId(id), null, JSON.stringify(id));
    assert.equal(isTeamWorkspace(id), false, JSON.stringify(id));
  }
});
