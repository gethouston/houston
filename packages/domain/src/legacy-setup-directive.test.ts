import assert from "node:assert/strict";
import { test } from "vitest";
import {
  LEGACY_SETUP_BEGIN as BEGIN,
  LEGACY_SETUP_END as END,
  stripLegacySetupDirective,
} from "./legacy-setup-directive";

const section = (body: string) => `${BEGIN}\n${body}\n${END}`;

test("the marked section goes and the user's text around it stays", () => {
  const md = `# Sales\n\nBe helpful.\n\n${section("Send ONE real email now.")}\n`;
  assert.equal(stripLegacySetupDirective(md), "# Sales\n\nBe helpful.\n");
});

test("text after the section is kept, joined by one blank line", () => {
  const md = `Intro.\n\n${section("x")}\n\nOutro.\n`;
  assert.equal(stripLegacySetupDirective(md), "Intro.\n\nOutro.\n");
});

test("a file that is only the section becomes empty", () => {
  assert.equal(stripLegacySetupDirective(`${section("x")}\n`), "");
});

test("every section goes, not just the first", () => {
  const md = `A\n\n${section("one")}\n\nB\n\n${section("two")}\n`;
  assert.equal(stripLegacySetupDirective(md), "A\n\nB\n");
});

test("the job description's facts at the head survive untouched", () => {
  const facts = "---\nindustry: Healthcare\nrole: Medical coder\n---\n";
  assert.equal(stripLegacySetupDirective(`${facts}\n${section("x")}\n`), facts);
});

test("a file with no complete section is returned as the same string", () => {
  const clean = "# Sales\n\nBe helpful.\n";
  assert.equal(stripLegacySetupDirective(clean), clean);
  const unterminated = `Keep.\n\n${BEGIN}\nno end marker\n`;
  assert.equal(stripLegacySetupDirective(unterminated), unterminated);
});

test("stripping twice changes nothing more", () => {
  const once = stripLegacySetupDirective(`A\n\n${section("x")}\n`);
  assert.equal(stripLegacySetupDirective(once), once);
});
