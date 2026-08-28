import { expect, test } from "vitest";
import { ownConversationOnly } from "./turn-hot-set";

const standing = "workspaces/Personal/Bob/.houston/runtime";

test("admits the turn's own conversation state, nothing of the others", () => {
  const admit = ownConversationOnly("c1");
  expect(admit(`${standing}/conversations/c1.json`)).toBe(true);
  expect(admit(`${standing}/sessions/c1/session.jsonl`)).toBe(true);
  expect(admit(`${standing}/sessions/c1/deep/x`)).toBe(false);
  expect(admit(`${standing}/conversations/c2.json`)).toBe(false);
  expect(admit(`${standing}/sessions/c2/session.jsonl`)).toBe(false);
  // A conversation id that needs encoding matches its encoded file name.
  expect(
    ownConversationOnly("a b")(`${standing}/conversations/a%20b.json`),
  ).toBe(true);
});

test("everything outside conversations/sessions is admitted, in both layouts", () => {
  const admit = ownConversationOnly("c1");
  expect(admit("workspaces/Personal/Bob/CLAUDE.md")).toBe(true);
  expect(admit(`${standing}/settings.json`)).toBe(true);
  expect(admit("workspaces/Personal/Bob/.houston/routines/routines.json")).toBe(
    true,
  );
  expect(admit("workspaces/Personal/Bob/files/report.csv")).toBe(true);
  expect(admit("data/settings.json")).toBe(true);
  expect(admit("data/conversations/c1.json")).toBe(true);
  expect(admit("data/conversations/c2.json")).toBe(false);
  expect(admit("data/sessions/c2/s.jsonl")).toBe(false);
  expect(admit("workspace/notes.md")).toBe(true);
});

test("a user project's own conversations folder is never mistaken for the runtime", () => {
  const admit = ownConversationOnly("c1");
  expect(admit("workspaces/Personal/Bob/files/conversations/c2.json")).toBe(
    true,
  );
  expect(
    admit(
      "workspaces/Personal/Bob/proj/.houston/runtime/conversations/c2.json",
    ),
  ).toBe(true);
});

test("hydrates the active conversation's Claude subtree only", () => {
  const admit = ownConversationOnly("c1");
  expect(admit(`${standing}/sessions/c1/claude/projects/slug/s.jsonl`)).toBe(
    true,
  );
  expect(admit(`${standing}/sessions/c1/claude/sessions.json`)).toBe(true);
  expect(admit(`${standing}/sessions/c2/claude/projects/slug/s.jsonl`)).toBe(
    false,
  );
});

test("keeps only the live session tail from the complete listing", () => {
  const session = `${standing}/sessions/c1`;
  const piOld = `${session}/2026-08-20T19-00-01-250Z_old.jsonl`;
  const piNew = `${session}/2026-08-21T19-00-01-250Z_new.jsonl`;
  const claudeOld = `${session}/claude/projects/old/old-session.jsonl`;
  const claudeNew = `${session}/claude/projects/foreign/new-session.jsonl`;
  const listing = [
    { rel: piOld, updated: "2026-08-28T12:00:00.000Z" },
    { rel: piNew, updated: "2026-08-20T12:00:00.000Z" },
    { rel: `${session}/harness.json`, updated: "2026-08-20T12:00:00.000Z" },
    {
      rel: `${session}/claude/sessions.json`,
      updated: "2026-08-20T12:00:00.000Z",
    },
    { rel: claudeOld, updated: "2026-08-20T12:00:00.000Z" },
    { rel: claudeNew, updated: "2026-08-21T12:00:00.000Z" },
  ];
  const admit = ownConversationOnly("c1");

  expect(admit(piOld, listing)).toBe(false);
  expect(admit(piNew, listing)).toBe(true);
  expect(admit(`${session}/harness.json`, listing)).toBe(true);
  expect(admit(`${session}/claude/sessions.json`, listing)).toBe(true);
  expect(admit(claudeOld, listing)).toBe(false);
  expect(admit(claudeNew, listing)).toBe(true);
});

test("admits every Claude transcript when listing timestamps are incomplete", () => {
  const session = `${standing}/sessions/c1/claude/projects`;
  const first = `${session}/old/0f28a2aa.jsonl`;
  const second = `${session}/current/fd190c42.jsonl`;
  const admit = ownConversationOnly("c1");

  for (const listing of [
    [{ rel: first }, { rel: second }],
    [{ rel: first, updated: "2026-08-20T12:00:00.000Z" }, { rel: second }],
  ]) {
    expect(admit(first, listing)).toBe(true);
    expect(admit(second, listing)).toBe(true);
  }
});
