import { doesNotMatch, match, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const shell = read("../src/components/ai-hub/modal-shell.tsx");

describe("AI Hub uses the shared dialog frame", () => {
  it("inherits frame styling and motion with the wide flow sheet width", () => {
    for (const override of [
      "ht-shadow-modal",
      "ai-hub-modal-surface",
      "border-0",
      "sm:max-w-none",
      " w-[min(",
      "rounded-",
      "bg-dialog",
      "text-[",
      "grid-rows",
    ]) {
      ok(!shell.includes(override), `ModalShell must not override ${override}`);
    }
    ok(
      shell.includes(
        '"flex max-h-[85dvh] min-h-[60dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(42rem,calc(100%-2rem))]",',
      ),
    );
    match(shell, /className=\{cn\([\s\S]*?className,/);
    match(shell, /<DialogTitle>\{title\}<\/DialogTitle>/);
    match(shell, /<DialogDescription>\{description\}<\/DialogDescription>/);
  });

  it("pins the header and footer around one bounded scrolling body", () => {
    match(shell, /flex shrink-0 items-start gap-2 px-5 pt-5 pb-4/);
    match(shell, /className="min-w-0 flex-1"/);
    match(shell, /className="min-h-0 flex-1 overflow-y-auto"/);
    match(shell, /className="shrink-0 border-t border-line px-5 py-3"/);
    // Header, body and footer share one inset; a desktop-only inset on the
    // chrome alone leaves the rows 12px ragged against the title.
    doesNotMatch(shell, /md:px-/);
    match(shell, /<DialogTitle className="sr-only">\{title\}/);
    match(shell, /<DialogDescription className="sr-only">\{description\}/);
  });

  it("owns one close control, the frame's own X", () => {
    match(shell, /closeLabel: string/);
    match(shell, /showCloseButton=\{false\}/);
    strictEqual(shell.match(/<DialogCloseButton /g)?.length, 1);
    match(
      shell,
      /<DialogCloseButton label=\{closeLabel\} className="-mr-1.5" \/>/,
    );
    doesNotMatch(shell, /XIcon|<Button|DialogClose asChild/);
    match(shell, /if \(!next\) onClose\(\)/);
  });

  for (const name of ["provider-modal", "model-modal"]) {
    it(`${name} supplies an unpadded header and translated close label`, () => {
      const source = read(`../src/components/ai-hub/${name}.tsx`);
      doesNotMatch(source, /<X className/);
      match(source, /closeLabel=\{t\("common:actions.close"\)\}/);
      match(
        source,
        /const header = \(\s*<div className="flex items-start gap-3">/,
      );
      if (name === "provider-modal") match(source, /<ConnectButton /);
      ok(
        source.trimEnd().split("\n").length <= 200,
        `${name} stays within 200 lines`,
      );
    });
  }

  it("leaves modal animations to the dialog frame", () => {
    doesNotMatch(read("../src/styles/futuristic.css"), /ai-hub-modal/);
  });
});
