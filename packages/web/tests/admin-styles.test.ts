import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { btn, C, ghostBtn, secondaryBtn } from "../src/admin/styles";

/**
 * The /admin chunk's stylesheet contract. The operator dashboard renders
 * OUTSIDE the app tree, painting itself with inline `var(--ht-*)` styles, so it
 * needs the token variables and nothing else. Pulling the app's globals.css
 * instead dragged in `body { overflow: hidden }` — the app shell scrolls inside
 * its panes — and the dashboard, which has no scroll container of its own, left
 * every row below the fold unreachable.
 */
const adminDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/admin",
);
const read = (file: string): string =>
  readFileSync(path.join(adminDir, file), "utf8");

const TOKEN_CSS = "@houston/design-tokens/css";
const tokensCss = readFileSync(
  createRequire(import.meta.url).resolve(TOKEN_CSS),
  "utf8",
);

describe("/admin stylesheet", () => {
  it("the entry module pulls exactly one stylesheet: the admin's own", () => {
    const imported = [
      ...read("dashboard.tsx").matchAll(/import\s+"([^"]+\.css)"/g),
    ].map((m) => m[1]);
    expect(imported).toEqual(["./admin.css"]);
  });

  it("that stylesheet imports the design tokens and nothing else", () => {
    const imported = [
      ...read("admin.css").matchAll(/@import\s+"([^"]+)"/g),
    ].map((m) => m[1]);
    expect(imported).toEqual([TOKEN_CSS]);
  });

  it("nothing in the admin's CSS locks the page's scroll", () => {
    // Comments stripped: this file's own prose explains the rule it forbids.
    const rules = (read("admin.css") + tokensCss).replaceAll(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(rules).not.toMatch(/overflow\s*:\s*hidden/);
  });

  it("the token CSS carries the dark ladder the dashboard pins", () => {
    expect(tokensCss).toContain('[data-theme="dark"]');
    expect(tokensCss).toContain("--ht-action-text");
  });
});

describe("/admin palette", () => {
  it("is tokens only — no raw colour literal anywhere in the surface", () => {
    for (const value of Object.values(C)) {
      expect(value).toMatch(/^var\(--ht-[a-z-]+\)$/);
    }
    for (const file of [
      "styles.ts",
      "components.tsx",
      "dashboard.tsx",
      "sign-in.tsx",
    ]) {
      expect(read(file)).not.toMatch(/"white"|"black"|#[0-9a-fA-F]{3,8}/);
    }
  });

  it("the CTA wears the action PAIR, so its label contrasts with its fill", () => {
    expect(btn.background).toBe("var(--ht-action)");
    expect(btn.color).toBe("var(--ht-action-text)");
  });

  it("keeps the CTA tone, the link tone and both text steps distinct", () => {
    expect(C.accent).not.toBe(C.blue);
    expect(C.text).not.toBe(C.muted);
  });

  it("labels the quieter buttons with ink, never the CTA's inverted label", () => {
    expect(ghostBtn.background).toBe("transparent");
    expect(ghostBtn.color).toBe(C.text);
    // On a panel the secondary button carries the control fill, a step above the
    // panel, so it is a button and not a hairline drawn on the card.
    expect(secondaryBtn.background).toBe(C.field);
    expect(secondaryBtn.background).not.toBe(C.panel);
    expect(secondaryBtn.color).toBe(C.text);
  });
});
