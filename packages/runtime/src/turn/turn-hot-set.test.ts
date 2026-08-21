import { expect, test } from "vitest";
import { ownConversationOnly } from "./turn-hot-set";

const standing = "workspaces/Personal/Bob/.houston/runtime";

test("admits the turn's own conversation file and session dir, nothing of the others", () => {
  const admit = ownConversationOnly("c1");
  expect(admit(`${standing}/conversations/c1.json`)).toBe(true);
  expect(admit(`${standing}/sessions/c1/session.jsonl`)).toBe(true);
  expect(admit(`${standing}/sessions/c1/deep/x`)).toBe(true);
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
