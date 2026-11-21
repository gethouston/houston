import { expect, test } from "vitest";
import { BrowserToolError } from "./errors";
import { nextGeneration, resolveRef, stampRefs } from "./refs";

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BrowserToolError);
    return (error as BrowserToolError).code;
  }
  throw new Error("expected a refusal");
};

test("every ref in a snapshot carries its generation, iframe refs included", () => {
  const tree = [
    '- textbox "Username" [ref=e4]',
    "- iframe [ref=e9]:",
    '  - button "Verify" [ref=f1e3]',
    "- text: [ref=e5] in prose is not a ref mark",
    '- button "Keep [ref=e5]" [active] [ref=e6]: Keep [ref=e5]',
  ].join("\n");
  expect(stampRefs(tree, 7)).toBe(
    [
      '- textbox "Username" [ref=s7e4]',
      "- iframe [ref=s7e9]:",
      '  - button "Verify" [ref=s7f1e3]',
      "- text: [ref=e5] in prose is not a ref mark",
      '- button "Keep [ref=e5]" [active] [ref=s7e6]: Keep [ref=e5]',
    ].join("\n"),
  );
});

test("a ref from the latest snapshot resolves to Playwright's own ref", () => {
  const tab = { generation: 12 };
  expect(resolveRef(tab, "s12e4")).toBe("e4");
  expect(resolveRef(tab, "s12f1e3")).toBe("f1e3");
});

test("an older, newer or unprefixed ref is refused as stale", () => {
  const tab = { generation: 12 };
  for (const raw of ["s11e4", "s13e4", "e4", "f1e3", "s12", "s12x4", ""])
    expect(refusal(() => resolveRef(tab, raw))).toBe("stale_ref");
});

test("generations are one counter for every tab in the process", () => {
  const a = nextGeneration();
  const b = nextGeneration();
  expect(b).toBe(a + 1);
  expect(refusal(() => resolveRef({ generation: b }, `s${a}e1`))).toBe(
    "stale_ref",
  );
});
