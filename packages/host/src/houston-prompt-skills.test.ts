import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  SKILLS_GUIDANCE,
  skillsAndMemoryGuidance,
} from "./houston-prompt-skills";

/**
 * This guidance exists TWICE — here for the host, and in
 * `app/src-tauri/src/houston_prompt/skills_memory.rs` for the desktop shell's
 * own copy — and the two are the same product rules. They drifted before
 * (the desktop taught the `integrations:` frontmatter field and the host did
 * not, so an agent behind the host wrote Skills that named no apps), which is
 * exactly the kind of difference no screen shows and no other test catches.
 *
 * So this diffs the two SOURCES whole, not a handful of phrases: the Rust copy is a
 * raw string literal (`r#"…"#`), which carries no escapes, so its bytes are the
 * prompt's bytes and can be compared to the evaluated TypeScript constant
 * directly.
 */

const RUST = readFileSync(
  fileURLToPath(
    new URL(
      "../../../app/src-tauri/src/houston_prompt/skills_memory.rs",
      import.meta.url,
    ),
  ),
  "utf8",
);

/**
 * Lines the DESKTOP copy carries alone, removed before the diff.
 *
 * Only one: the desktop shell states that it prefixes a skill run with an
 * explicit `Use the <skill> skill.` line. Each is asserted present first, so
 * this list can never quietly stop matching and hide a real difference.
 */
const DESKTOP_ONLY = [
  "- The desktop adds an explicit `Use the <skill> skill.` prefix so invocation stays deterministic.\n",
];

/** The mirrored block as the Rust file holds it: the whole raw string literal,
 *  from the heading right after its opening delimiter to its end. */
function rustSkillsGuidance(): string {
  const literal = RUST.indexOf('r#"');
  const start = RUST.indexOf("## How-To Guidance", literal);
  const end = RUST.indexOf('\n"#;');
  expect(
    start,
    "the Rust mirror must still open with the How-To Guidance heading",
  ).toBeGreaterThan(-1);
  expect(
    end,
    "the Rust mirror must still be a raw string literal",
  ).toBeGreaterThan(start);
  let block = RUST.slice(start, end);
  for (const line of DESKTOP_ONLY) {
    expect(
      block,
      "a desktop-only line vanished — drop it from DESKTOP_ONLY",
    ).toContain(line);
    block = block.replace(line, "");
  }
  return block;
}

test("the guidance is byte-identical to the desktop's Rust mirror", () => {
  expect(skillsAndMemoryGuidance).toBe(rustSkillsGuidance());
});

test("both mirrors teach the job description's frontmatter block", () => {
  // The agent rewrites its OWN CLAUDE.md. Without this it drops the block the
  // app writes, and the user's industry + role vanish on the next rewrite.
  for (const guidance of [skillsAndMemoryGuidance, rustSkillsGuidance()]) {
    expect(guidance).toContain(
      "The file opens with a small block fenced by `---` lines holding two fields, `industry` and `role`:",
    );
    expect(guidance).toContain("industry: Healthcare\nrole: Medical coder");
    expect(guidance).toContain(
      "keep it intact and at the top every time you write the file",
    );
    expect(guidance).toContain(
      "When the user tells you their industry or their role changed, update those two lines to match.",
    );
  }
});

test("both mirrors teach the frontmatter fields a Skill actually carries", () => {
  // The two lines the host was missing, pinned by content so a future edit that
  // drops them from BOTH copies (which the diff above would happily accept)
  // still fails.
  expect(SKILLS_GUIDANCE).toContain("integrations: [tavily, gmail]");
  expect(SKILLS_GUIDANCE).toContain(
    "`integrations` lists the toolkit slugs of the connected apps the Skill needs.",
  );
});

test("both mirrors teach the per-step app tag, and what it buys", () => {
  // Same reason as above: the diff alone would accept losing this from both
  // copies. The tag is what lets a saved step run its action straight away
  // instead of searching for it again on every run.
  expect(SKILLS_GUIDANCE).toContain(
    "tag it with that app's toolkit slug right after the bold title",
  );
  expect(SKILLS_GUIDANCE).toContain("[toolkit:ACTION_SLUG]");
  expect(SKILLS_GUIDANCE).toContain("**Send the digest** [gmail]");
  expect(SKILLS_GUIDANCE).toContain(
    "**Share the result** [gmail:GMAIL_SEND_EMAIL]",
  );
  expect(SKILLS_GUIDANCE).toContain(
    "calling `integration_execute` with that action straight away, with no `integration_search` first",
  );
});

test("neither mirror names the integrations provider", () => {
  // The prompt's own rule ("never name the integrations provider"), pinned for
  // the host by `houston-prompt.test.ts`. Both mirrors say "connected apps",
  // the desktop copy's `integrations` frontmatter bullet included.
  expect(SKILLS_GUIDANCE).not.toContain("Composio");
});

test("the prompt copy carries no em dashes", () => {
  // The repo's user-copy rule, and the character two hand-kept mirrors of the
  // same guidance most easily drift apart on.
  expect(skillsAndMemoryGuidance).not.toContain("—");
});
