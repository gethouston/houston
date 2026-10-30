import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HydrateListedObject } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { claudeFlagsFileName } from "./claude-flags-path";
import { ownClaudeFlagsOnly, ownConversationOnly } from "./turn-hot-set";

const standing = "workspaces/Personal/Bob/.houston/runtime";
const session = `${standing}/sessions/c1`;
const sessionsRel = `${session}/claude/sessions.json`;

function rootWithSessions(contents?: string): string {
  const root = mkdtempSync(join(tmpdir(), "hot-set-"));
  if (contents !== undefined) {
    const file = join(root, ...sessionsRel.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, contents);
  }
  return root;
}

function listed(...rels: string[]): HydrateListedObject[] {
  return rels.map((rel) => ({ rel }));
}

test("admits the turn's own conversation state, nothing of the others", () => {
  const root = rootWithSessions();
  const ownConversation = `${standing}/conversations/c1.json`;
  const ownSession = `${session}/session.jsonl`;
  const listing = listed(ownConversation, ownSession);
  const admit = ownConversationOnly("c1");
  expect(admit(ownConversation, listing, root)).toBe(true);
  expect(admit(ownSession, listing, root)).toBe(true);
  expect(admit(`${session}/deep/x`, listing, root)).toBe(false);
  expect(admit(`${standing}/conversations/c2.json`, listing, root)).toBe(false);
  expect(admit(`${standing}/sessions/c2/session.jsonl`, listing, root)).toBe(
    false,
  );
  const encoded = `${standing}/conversations/a%20b.json`;
  expect(ownConversationOnly("a b")(encoded, listed(encoded), root)).toBe(true);
});

test("admits the turn's own archive segments, never another conversation's", () => {
  // A shared routine chat's archive grows without bound (54+ MiB of
  // segments); a turn in any OTHER chat of the agent must not download it.
  const root = rootWithSessions();
  const admit = ownConversationOnly("c1");
  for (const runtime of [standing, "data"]) {
    const own = `${runtime}/conversations/c1.archive/1.json`;
    const other = `${runtime}/conversations/routine-r1.archive/7.json`;
    const prefixTwin = `${runtime}/conversations/c10.archive/1.json`;
    const listing = listed(own, other, prefixTwin);
    expect(admit(own, listing, root)).toBe(true);
    expect(admit(other, listing, root)).toBe(false);
    expect(admit(prefixTwin, listing, root)).toBe(false);
  }
  const encoded = `${standing}/conversations/a%20b.archive/2.json`;
  expect(ownConversationOnly("a b")(encoded, listed(encoded), root)).toBe(true);
  // Anything deeper or oddly named under conversations/ is not a segment of
  // this chat either.
  expect(
    admit(`${standing}/conversations/c1.archive/deep/2.json`, listed(), root),
  ).toBe(false);
  expect(admit(`${standing}/conversations/c1/1.json`, listed(), root)).toBe(
    false,
  );
});

test("hydrates only the two newest of the turn's own archive segments", () => {
  // The rest stay remote: a routine digest reads ROUTINE_REPLAY_TAIL
  // messages, and an older segment is fetched only when a reader reaches
  // back (turn-archive-fetch.ts).
  const root = rootWithSessions();
  for (const runtime of [standing, "data"]) {
    const segment = (n: number) =>
      `${runtime}/conversations/c1.archive/${n}.json`;
    const listing = listed(...[1, 2, 9, 10, 11].map(segment));
    const admit = ownConversationOnly("c1");
    // Numeric order, not lexical: 10 and 11 are newer than 9.
    for (const n of [10, 11])
      expect(admit(segment(n), listing, root)).toBe(true);
    for (const n of [1, 2, 9])
      expect(admit(segment(n), listing, root)).toBe(false);
  }
});

test("hydrates the conversation's own markers, never another's", () => {
  const root = rootWithSessions();
  const admit = ownConversationOnly("c1");
  for (const marker of [
    "harness.json",
    "autocompact.json",
    "routine-results.md",
  ]) {
    expect(admit(`${session}/${marker}`, listed(), root)).toBe(true);
    expect(admit(`${standing}/sessions/c2/${marker}`, listed(), root)).toBe(
      false,
    );
  }
  expect(admit(`${session}/other.json`, listed(), root)).toBe(false);
});

test("everything outside conversations/sessions is admitted, in both layouts", () => {
  const root = rootWithSessions();
  const paths = [
    "workspaces/Personal/Bob/CLAUDE.md",
    `${standing}/settings.json`,
    "workspaces/Personal/Bob/.houston/routines/routines.json",
    "workspaces/Personal/Bob/files/report.csv",
    "data/settings.json",
    "data/conversations/c1.json",
    "workspace/notes.md",
  ];
  const listing = listed(...paths);
  const admit = ownConversationOnly("c1");
  for (const path of paths) expect(admit(path, listing, root)).toBe(true);
  expect(admit("data/conversations/c2.json", listing, root)).toBe(false);
  expect(admit("data/sessions/c2/s.jsonl", listing, root)).toBe(false);
});

test("a user project's conversations folder is never mistaken for runtime", () => {
  const root = rootWithSessions();
  const paths = [
    "workspaces/Personal/Bob/files/conversations/c2.json",
    "workspaces/Personal/Bob/proj/.houston/runtime/conversations/c2.json",
  ];
  const listing = listed(...paths);
  const admit = ownConversationOnly("c1");
  for (const path of paths) expect(admit(path, listing, root)).toBe(true);
});

test("keeps two Pi tails and the Claude transcript named by sessions.json", () => {
  const root = rootWithSessions('{"c1":"session-new"}');
  const piOld = `${session}/2026-08-20T19-00-01-250Z_old.jsonl`;
  const piReadable = `${session}/2026-08-21T19-00-01-250Z_readable.jsonl`;
  const piNewest = `${session}/2026-08-22T19-00-01-250Z_torn.jsonl`;
  const stale = `${session}/claude/projects/old/session-old.jsonl`;
  const mapped = `${session}/claude/projects/current/session-new.jsonl`;
  const listing = [
    { rel: piOld },
    { rel: piReadable },
    { rel: piNewest },
    { rel: sessionsRel },
    { rel: stale, updated: "2026-08-28T12:00:00.000Z" },
    { rel: mapped, updated: "2026-08-20T12:00:00.000Z" },
  ];
  const admit = ownConversationOnly("c1");

  expect(admit(piOld, listing, root)).toBe(false);
  expect(admit(piReadable, listing, root)).toBe(true);
  expect(admit(piNewest, listing, root)).toBe(true);
  expect(admit(sessionsRel, listing, root)).toBe(true);
  expect(admit(stale, listing, root)).toBe(false);
  expect(admit(mapped, listing, root)).toBe(true);
});

test("Claude selection fails open without a usable present pointer", () => {
  const first = `${session}/claude/projects/old/session-one.jsonl`;
  const second = `${session}/claude/projects/current/session-two.jsonl`;
  const cache = `${session}/claude/projects/current/cache.bin`;

  for (const { root, listing } of [
    { root: rootWithSessions(), listing: listed(first, second, cache) },
    {
      root: rootWithSessions("not json"),
      listing: listed(sessionsRel, first, second, cache),
    },
    {
      root: rootWithSessions('{"c1":"missing-session"}'),
      listing: listed(sessionsRel, first, second, cache),
    },
  ]) {
    const admit = ownConversationOnly("c1");
    expect(admit(first, listing, root)).toBe(true);
    expect(admit(second, listing, root)).toBe(true);
    expect(admit(cache, listing, root)).toBe(false);
  }
});

test("hydrates the acting member's flag cache and no other member's", () => {
  const root = rootWithSessions();
  const alice = claudeFlagsFileName("user-alice");
  const bob = claudeFlagsFileName("user-bob");
  const paths = [
    `${standing}/claude-flags/${alice}`,
    `${standing}/claude-flags/${bob}`,
    `data/claude-flags/${alice}`,
    `data/claude-flags/${bob}`,
    `${standing}/claude-flags/nested/${alice}`,
  ];
  const listing = listed(...paths);
  const asAlice = ownConversationOnly("c1", "user-alice");
  expect(paths.map((path) => asAlice(path, listing, root))).toEqual([
    true,
    false,
    true,
    false,
    false,
  ]);
  // No acting member: nobody's cache.
  const anonymous = ownConversationOnly("c1");
  for (const path of paths) expect(anonymous(path, listing, root)).toBe(false);
});

test("an unclaimed turn's whole-tree hydrate still skips other members' caches", () => {
  const alice = claudeFlagsFileName("user-alice");
  const bob = claudeFlagsFileName("user-bob");
  const asAlice = ownClaudeFlagsOnly("user-alice");
  expect(asAlice(`${standing}/claude-flags/${alice}`)).toBe(true);
  expect(asAlice(`${standing}/claude-flags/${bob}`)).toBe(false);
  expect(asAlice(`data/claude-flags/${bob}`)).toBe(false);
  // Everything else still hydrates, other conversations included.
  expect(asAlice(`${standing}/conversations/c2.json`)).toBe(true);
  expect(asAlice("workspaces/Personal/Bob/notes.md")).toBe(true);
  expect(ownClaudeFlagsOnly()(`${standing}/claude-flags/${alice}`)).toBe(false);
});
