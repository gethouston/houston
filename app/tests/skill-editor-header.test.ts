import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  HEADER_HEIGHT,
  HEADER_HEIGHT_DESKTOP,
} from "../src/components/shell/page-header/page-header-layout.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the page-header strip height is declared once", () => {
  it("the desktop-layer spelling is the same height", () => {
    // Written out rather than composed because Tailwind reads class names out
    // of source; this pins the two together.
    strictEqual(HEADER_HEIGHT_DESKTOP, `md:${HEADER_HEIGHT}`);
  });

  it("the skill editor's strip imports it instead of hardcoding 48px", () => {
    const src = read("../src/components/skills-view/skill-editor-header.tsx");
    ok(src.includes("HEADER_HEIGHT_DESKTOP"), "imports the strip height");
    ok(!/\bmd:h-12\b/.test(src), "no hand-written md:h-12");
  });
});

describe("one way back, everywhere", () => {
  it("the skill editor uses the shared BackControl", () => {
    const src = read("../src/components/skills-view/skill-editor-header.tsx");
    ok(src.includes("<BackControl"), "renders the shared control");
    ok(!src.includes("ArrowLeft"), "no hand-rolled back glyph");
  });

  it("BackControl's compact size is additive — default keeps the two shapes", () => {
    const src = read("../src/components/shell/back-control.tsx");
    ok(src.includes('size = "default"'), "the current look is the default");
    ok(src.includes("compact"), "a compact size exists for dense strips");
    ok(
      src.includes("md:not-sr-only"),
      "the default still names where back goes on the desktop",
    );
  });
});

describe("one skill body, parameterised by surface", () => {
  it("the page's copy is gone and both callers pass a variant", () => {
    const body = read("../src/components/skills-view/skill-body-editor.tsx");
    ok(body.includes('variant: "dialog"'), "the dialog surface");
    ok(body.includes('variant: "page"'), "the page surface");
    ok(
      read("../src/components/skills-view/manage-skill-body.tsx").includes(
        'variant="dialog"',
      ),
    );
    ok(
      read("../src/components/skills-view/skill-editor-page.tsx").includes(
        'variant="page"',
      ),
    );
  });

  it("both detail surfaces bind ONE detail hook", () => {
    for (const rel of [
      "../src/components/skills-view/use-skill-editor.ts",
      "../src/components/skills-view/manage-skill-dialog.tsx",
    ])
      ok(
        read(rel).includes("useSkillDetailSurface"),
        `${rel} binds the shared detail surface`,
      );
  });

  it("the manage dialog stays inside the file law", () => {
    const lines = read(
      "../src/components/skills-view/manage-skill-dialog.tsx",
    ).split("\n").length;
    ok(lines <= 200, `manage-skill-dialog.tsx is ${lines} lines`);
  });
});
