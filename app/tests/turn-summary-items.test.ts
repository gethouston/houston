import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { skillFolderPathOf } from "../src/lib/skill-folder-path.ts";
import {
  buildTurnSummaryItems,
  groupTurnSummaryItems,
  type TurnSummaryItem,
} from "../src/lib/turn-summary-items.ts";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

const AGENT = "Personal/Assistant";
const ok_ = (content = "ok") => ({ content, is_error: false });
const skillPath = (slug: string, file = "SKILL.md") =>
  `/Users/jo/.houston/workspaces/Personal/Assistant/.agents/skills/${slug}/${file}`;

const build = (
  tools: Parameters<typeof buildTurnSummaryItems>[0],
  fileChanges: Parameters<typeof buildTurnSummaryItems>[2] = [],
): TurnSummaryItem[] => buildTurnSummaryItems(tools, AGENT, fileChanges);

describe("skillFolderPathOf", () => {
  it("names the skill a SKILL.md path belongs to", () => {
    deepStrictEqual(skillFolderPathOf(".agents/skills/meeting-prep/SKILL.md"), {
      slug: "meeting-prep",
      isSkillFile: true,
    });
    deepStrictEqual(skillFolderPathOf(".claude/skills/Invoice-Bot/SKILL.md"), {
      slug: "Invoice-Bot",
      isSkillFile: true,
    });
  });

  it("marks a file BESIDE the SKILL.md as folder material", () => {
    deepStrictEqual(
      skillFolderPathOf(".agents/skills/meeting-prep/refs/tone.md"),
      { slug: "meeting-prep", isSkillFile: false },
    );
  });

  it("reads Windows separators and absolute paths", () => {
    deepStrictEqual(
      skillFolderPathOf(
        String.raw`C:\Users\jo\W\A\.agents\skills\notes\SKILL.md`,
      ),
      { slug: "notes", isSkillFile: true },
    );
  });

  it("answers null outside a skills folder", () => {
    strictEqual(skillFolderPathOf("reports/SKILL.md"), null);
    strictEqual(skillFolderPathOf(".agents/skills/"), null);
  });
});

describe("a saved skill gets its own named row", () => {
  it("counts the pi runtime's lowercase write tool", () => {
    const items = build([
      {
        name: "write",
        input: { path: skillPath("meeting-prep") },
        result: ok_(),
      },
    ]);
    deepStrictEqual(items, [{ kind: "skill", slug: "meeting-prep" }]);
  });

  it("counts Claude's PascalCase Write tool", () => {
    const items = build([
      {
        name: "Write",
        input: { file_path: skillPath("meeting-prep") },
        result: ok_(),
      },
    ]);
    deepStrictEqual(items, [{ kind: "skill", slug: "meeting-prep" }]);
  });

  it("gives every skill of the turn a row of its own", () => {
    const items = build([
      { name: "write", input: { path: skillPath("a") }, result: ok_() },
      { name: "write", input: { path: skillPath("b") }, result: ok_() },
    ]);
    deepStrictEqual(items, [
      { kind: "skill", slug: "a" },
      { kind: "skill", slug: "b" },
    ]);
  });

  it("collapses the same skill written twice into one row", () => {
    const items = build([
      { name: "write", input: { path: skillPath("a") }, result: ok_() },
      { name: "write", input: { path: skillPath("a") }, result: ok_() },
    ]);
    strictEqual(items.length, 1);
  });

  it("stays in Updates made, never in New files", () => {
    const groups = groupTurnSummaryItems(
      build([
        { name: "write", input: { path: skillPath("a") }, result: ok_() },
      ]),
    );
    strictEqual(groups.files.length, 0);
    deepStrictEqual(groups.updates, [{ kind: "skill", slug: "a" }]);
  });

  it("drops a failed write", () => {
    const items = build([
      {
        name: "write",
        input: { path: skillPath("a") },
        result: { content: "denied", is_error: true },
      },
    ]);
    deepStrictEqual(items, []);
  });
});

describe("skill work that is not a saved SKILL.md", () => {
  it("keeps the generic row for a file beside the SKILL.md", () => {
    const items = build([
      {
        name: "write",
        input: { path: skillPath("a", "refs/tone.md") },
        result: ok_(),
      },
    ]);
    deepStrictEqual(items, [{ kind: "semantic", update: "skills" }]);
  });

  it("keeps the generic row for an edit of an existing SKILL.md", () => {
    const items = build([
      { name: "edit", input: { path: skillPath("a") }, result: ok_() },
    ]);
    deepStrictEqual(items, [{ kind: "semantic", update: "skills" }]);
  });

  it("does not add the generic row next to the skill it already names", () => {
    const items = build([
      { name: "write", input: { path: skillPath("a") }, result: ok_() },
      { name: "edit", input: { path: skillPath("a") }, result: ok_() },
    ]);
    deepStrictEqual(items, [{ kind: "skill", slug: "a" }]);
  });

  it("adds the generic row for a DIFFERENT skill's folder work", () => {
    const items = build([
      { name: "write", input: { path: skillPath("a") }, result: ok_() },
      {
        name: "write",
        input: { path: skillPath("b", "refs/tone.md") },
        result: ok_(),
      },
    ]);
    deepStrictEqual(items, [
      { kind: "skill", slug: "a" },
      { kind: "semantic", update: "skills" },
    ]);
  });
});

describe("both tool dialects reach the other summary rows", () => {
  it("classifies CLAUDE.md written by either dialect", () => {
    for (const tool of [
      { name: "write", input: { path: `${AGENT}/CLAUDE.md` }, result: ok_() },
      {
        name: "Write",
        input: { file_path: `${AGENT}/CLAUDE.md` },
        result: ok_(),
      },
    ]) {
      deepStrictEqual(build([tool]), [
        { kind: "semantic", update: "instructions" },
      ]);
    }
  });

  it("lists a user file written by the lowercase tool", () => {
    const items = build([
      {
        name: "write",
        input: {
          path: "/Users/jo/.houston/workspaces/Personal/Assistant/plan.md",
        },
        result: ok_(),
      },
    ]);
    deepStrictEqual(items, [
      {
        kind: "file",
        path: "/Users/jo/.houston/workspaces/Personal/Assistant/plan.md",
        change: "created",
      },
    ]);
  });

  it("reads paths out of the lowercase bash tool's output", () => {
    const items = build([
      { name: "bash", input: {}, result: ok_("Saved: report.pdf") },
    ]);
    deepStrictEqual(items, [
      { kind: "file", path: "report.pdf", change: "created" },
    ]);
  });
});

describe("one file, one row", () => {
  it("dedupes a tool's absolute path against the relative file change", () => {
    const items = build(
      [
        {
          name: "write",
          input: {
            path: "/Users/jo/.houston/workspaces/Personal/Assistant/plan.md",
          },
          result: ok_(),
        },
      ],
      [{ path: "plan.md", status: "modified" }],
    );
    strictEqual(items.length, 1);
    // The write is what created it, so the file belongs in "New files".
    deepStrictEqual(groupTurnSummaryItems(items).files, [
      { kind: "file", path: "plan.md", change: "created" },
    ]);
  });

  it("dedupes a saved skill reported by a tool and a file change", () => {
    const items = build(
      [{ name: "write", input: { path: skillPath("a") }, result: ok_() }],
      [{ path: ".agents/skills/a/SKILL.md", status: "created" }],
    );
    deepStrictEqual(items, [{ kind: "skill", slug: "a" }]);
  });
});

describe("the saved-skill label", () => {
  for (const [lang, bundle] of Object.entries({ en, es, pt })) {
    it(`${lang} names the skill`, () => {
      const copy = (bundle as { summary: Record<string, string> }).summary
        .skillSaved;
      strictEqual(typeof copy, "string");
      ok(
        copy.includes("{{name}}"),
        `${lang}: summary.skillSaved needs {{name}}`,
      );
      ok(!copy.includes("—"), `${lang}: no em dashes in user copy`);
    });
  }
});
