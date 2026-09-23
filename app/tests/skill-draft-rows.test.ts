import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");
const locale = (lang: string) =>
  JSON.parse(read(`../src/locales/${lang}/skills.json`)) as {
    setupChat: Record<string, string>;
  };

const rows = read("../src/components/skills-view/skill-draft-rows.tsx");

/**
 * Two chats abandoned mid-build are the same words twice ("Unfinished: New
 * skill"), so the only thing that tells them apart is WHEN each was last
 * worked on. The row therefore dates itself from the chat's own stamp.
 */
describe("the unfinished-chat row's description", () => {
  it("dates the chat from its last movement", () => {
    ok(rows.includes("skillDraftLastWorkedAt("));
    ok(rows.includes("formatRelativeTime("));
  });

  it("falls back to the undated line when the chat carries no stamp", () => {
    ok(rows.includes("setupChat.draftInProgress"));
  });

  for (const lang of ["en", "es", "pt"]) {
    it(`carries the dated line in ${lang}`, () => {
      const { setupChat } = locale(lang);
      const dated = setupChat.draftInProgressAt;
      ok(typeof dated === "string" && dated.length > 0);
      ok(dated.includes("{{when}}"), "the relative time is interpolated");
      strictEqual(dated.includes("—"), false, "no em dashes in user copy");
    });
  }
});
