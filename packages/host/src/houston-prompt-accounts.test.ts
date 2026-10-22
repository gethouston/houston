import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { houstonSystemPrompt } from "./houston-prompt";

test("account selection guidance matches the desktop prompt and requires asking about unnamed accounts", () => {
  const host = houstonSystemPrompt();
  const desktop = readFileSync(
    new URL(
      "../../../app/src-tauri/src/houston_prompt/integrations.rs",
      import.meta.url,
    ),
    "utf8",
  )
    .replace(/\\\r?\n[ \t]*/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"');
  const paragraph = host
    .split("\n\n")
    .find((text) => text.startsWith("A connected app can hold MORE"));
  expect(paragraph).toBeDefined();
  expect(desktop).toContain(paragraph);
  for (const phrase of [
    'otherwise "connected on <date>", otherwise "account 1" or "account 2"',
    "never omit it",
    "unambiguously identify one of the listed accounts",
    "If ANY account lacks an identity label and the choice is still unclear, you MUST ask ONE `ask_user` question before acting, even for read-only actions",
    "Never guess which account is work or personal",
    "without asking again for the same task",
    "never ask when the app has a single account",
  ]) {
    expect(paragraph).toContain(phrase);
  }
});
