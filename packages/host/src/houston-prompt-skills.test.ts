import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  SKILLS_GUIDANCE,
  skillsAndMemoryGuidance,
} from "./houston-prompt-skills";

const RUST = readFileSync(
  fileURLToPath(
    new URL(
      "../../../app/src-tauri/src/houston_prompt/skills_memory.rs",
      import.meta.url,
    ),
  ),
  "utf8",
);

const DESKTOP_ONLY = [
  "- The desktop adds an explicit `Use the <skill> skill.` prefix so invocation stays deterministic.\n",
];

function rustSkillsGuidance(): string {
  const literal = RUST.indexOf('r#"');
  const start = RUST.indexOf("## How-To Guidance", literal);
  const end = RUST.lastIndexOf('"#;');
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
  expect(SKILLS_GUIDANCE).toContain("integrations: [tavily, gmail]");
  expect(SKILLS_GUIDANCE).toContain(
    "`integrations` lists the toolkit slugs of the connected apps the Skill needs.",
  );
});

test("both mirrors teach the per-step app tag, and what it buys", () => {
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
  expect(SKILLS_GUIDANCE).not.toContain("Composio");
});

test("the prompt copy carries no em dashes", () => {
  expect(skillsAndMemoryGuidance).not.toContain("—");
});
