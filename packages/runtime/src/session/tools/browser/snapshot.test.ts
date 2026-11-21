import { expect, test } from "vitest";
import { maskPasswords } from "./mask-passwords";
import { capText, cutOffHint, SNAPSHOT_MAX_CHARS } from "./snapshot";

test("a snapshot under the cap is returned untouched", () => {
  const text = '- button "Sign in" [ref=e2]';
  expect(capText(text)).toEqual({ kept: text, omitted: 0 });
});

test("a long snapshot is cut on a line boundary, counting what was cut", () => {
  const line = '- link "Some navigation entry" [ref=e1]\n';
  const huge = line.repeat(10_000);
  const { kept, omitted } = capText(huge);
  expect(kept.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
  expect(kept.endsWith("[ref=e1]")).toBe(true);
  expect(omitted).toBe(huge.length - kept.length);
});

test("a single endless line is still capped", () => {
  expect(capText("x".repeat(50), 20)).toEqual({
    kept: "x".repeat(20),
    omitted: 30,
  });
});

test("the cut-off hint points at query and interactive", () => {
  expect(cutOffHint(42)).toContain("42 more characters not shown");
  expect(cutOffHint(42)).toContain("query");
  expect(cutOffHint(42)).toContain("interactive: true");
});

test("a password field's value is masked; the same text elsewhere is not", () => {
  const tree = [
    '- textbox "Username" [ref=e4]: student',
    '- textbox "Password" [active] [ref=e6]: hunter22',
    '- textbox "Other" [ref=e7]: "a: b"',
    "- text: hunter22 is not a secret in prose",
  ].join("\n");
  const masked = maskPasswords(tree, ["hunter22", "a: b", ""]);
  expect(masked).toContain('- textbox "Username" [ref=e4]: student');
  expect(masked).toContain("[ref=e6]: [password hidden]");
  expect(masked).toContain("[ref=e7]: [password hidden]");
  expect(masked).toContain("- text: hunter22 is not a secret in prose");
  expect(maskPasswords(tree, [])).toBe(tree);
});

test("a password is masked as Playwright prints it: whitespace collapsed, control characters escaped", () => {
  const tree = [
    '- textbox "A" [ref=e1]: correct horse',
    '- textbox "B" [ref=e2]: lead',
    '- textbox "C" [ref=e3]: "ab\\x01cd"',
    '- textbox "D" [ref=e4]: "s3cr\\x85t"',
    '- textbox "E" [ref=e5]: "back\\\\x41slash"',
  ].join("\n");
  const masked = maskPasswords(tree, [
    "correct  horse",
    " lead",
    "ab\x01cd",
    "s3cr\x85t",
    "back\\x41slash",
  ]);
  expect(masked.match(/\[password hidden\]/g)).toHaveLength(5);
  expect(maskPasswords('- textbox "F" [ref=e6]: tab here', ["tab\there"])).toBe(
    '- textbox "F" [ref=e6]: [password hidden]',
  );
});

test("a password printed as a placeholder textbox's text child is masked; a sibling's text is not", () => {
  const tree = [
    '- textbox "Password" [ref=e5]:',
    "  - /placeholder: Enter your password",
    "  - text: hunter22",
    '- paragraph "Hint" [ref=e6]:',
    "  - text: hunter22",
  ].join("\n");
  expect(maskPasswords(tree, ["hunter22"])).toBe(
    [
      '- textbox "Password" [ref=e5]:',
      "  - /placeholder: Enter your password",
      "  - text: [password hidden]",
      '- paragraph "Hint" [ref=e6]:',
      "  - text: hunter22",
    ].join("\n"),
  );
});

test('a password holding "]: " is masked whole, not from its last "]: "', () => {
  const line = '- textbox "Secret" [active] [ref=e8]: "ab]: cd"';
  expect(maskPasswords(line, ["ab]: cd"])).toBe(
    '- textbox "Secret" [active] [ref=e8]: [password hidden]',
  );
});
