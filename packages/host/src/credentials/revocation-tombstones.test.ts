import { expect, test } from "vitest";
import { RevocationTombstones } from "./revocation-tombstones";

const TTL_MS = 15 * 60_000;

function actingAs(sub: string): string {
  return `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;
}

const SCOPE = { workspaceId: "ws_1", provider: "anthropic" };

test("a team mark blocks the team caller until the TTL passes", () => {
  let now = 1_700_000_000_000;
  const t = new RevocationTombstones(() => now);

  expect(t.active(SCOPE)).toBe(false);
  t.mark({ ...SCOPE, scope: "team" });
  expect(t.active(SCOPE)).toBe(true);

  now += TTL_MS - 1;
  expect(t.active(SCOPE)).toBe(true);
  now += 1;
  expect(t.active(SCOPE)).toBe(false);
});

test("mark reports whether a tombstone was still active — the resurrection signal", () => {
  let now = 1_700_000_000_000;
  const t = new RevocationTombstones(() => now);

  expect(t.mark({ ...SCOPE, scope: "team" })).toBe(false);
  now += 30_000;
  // A second confirmed delete 30s later means something refilled the dead
  // credential — the caller escalates this one.
  expect(t.mark({ ...SCOPE, scope: "team" })).toBe(true);
  now += TTL_MS + 1;
  expect(t.mark({ ...SCOPE, scope: "team" })).toBe(false);
});

test("a team mark also blocks an acting caller (row resolution is the gateway's)", () => {
  const t = new RevocationTombstones(() => 1_700_000_000_000);
  t.mark({ ...SCOPE, scope: "team" });

  // A personal-space push carries an acting identity while its serve reports
  // the team row; the pod cannot mirror the gateway's resolution, so the
  // acting caller must be blocked by the team tombstone too.
  expect(t.active({ ...SCOPE, actingAs: actingAs("member-a") })).toBe(true);
});

test("a personal mark blocks only that member, never the team or a sibling", () => {
  const t = new RevocationTombstones(() => 1_700_000_000_000);
  t.mark({ ...SCOPE, scope: "personal", actingAs: actingAs("member-a") });

  expect(t.active({ ...SCOPE, actingAs: actingAs("member-a") })).toBe(true);
  expect(t.active({ ...SCOPE, actingAs: actingAs("member-b") })).toBe(false);
  expect(t.active(SCOPE)).toBe(false);
});

test("scoping: a different provider or workspace is never blocked", () => {
  const t = new RevocationTombstones(() => 1_700_000_000_000);
  t.mark({ ...SCOPE, scope: "team" });

  expect(t.active({ workspaceId: "ws_1", provider: "openai-codex" })).toBe(
    false,
  );
  expect(t.active({ workspaceId: "ws_2", provider: "anthropic" })).toBe(false);
});

test("clear lifts the block for both the acting and the team key", () => {
  const t = new RevocationTombstones(() => 1_700_000_000_000);
  const member = actingAs("member-a");
  t.mark({ ...SCOPE, scope: "team" });
  t.mark({ ...SCOPE, scope: "personal", actingAs: member });

  // The member's fresh sign-in clears their own key AND the shared one — a
  // user-driven connect supersedes the revocation for the rows it can land on.
  t.clear({ ...SCOPE, actingAs: member });

  expect(t.active({ ...SCOPE, actingAs: member })).toBe(false);
  expect(t.active(SCOPE)).toBe(false);
});
