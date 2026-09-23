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

/**
 * One skill body and one frame serve both scopes of the Skills surface: the
 * workspace library and an AI Employee's own Skills section. Pinned on the
 * SOURCE because the claim is about which surfaces exist, which no render of a
 * reachable surface can show.
 */
describe("one skill editor, parameterised by frame", () => {
  it("keeps no second, dialog-shaped body", () => {
    const body = read("../src/components/skills-view/skill-body-editor.tsx");
    ok(!body.includes('variant: "dialog"'), "no dialog surface survives");
    ok(!body.includes("DialogFooter"), "the editor is a page, not a modal");
  });

  it("the editor binds the shared detail hook", () => {
    ok(
      read("../src/components/skills-view/use-skill-editor.ts").includes(
        "useSkillDetailSurface",
      ),
    );
  });

  it("both scopes stand in the same frame component", () => {
    for (const rel of [
      "../src/components/skills-view/skills-view.tsx",
      "../src/components/skills-view/skill-editor-page.tsx",
    ])
      ok(read(rel).includes("SkillsSurfaceFrame"), `${rel} uses the frame`);
  });

  it("the editor stays inside the file law", () => {
    const lines = read(
      "../src/components/skills-view/skill-editor-page.tsx",
    ).split("\n").length;
    ok(lines <= 200, `skill-editor-page.tsx is ${lines} lines`);
  });
});
