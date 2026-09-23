import { ok } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Copy for a surface that no longer exists is worse than no copy: it is three
 * translations kept in step for a string nothing can render. These keys named
 * the instructions disclosure and the "Works with" strip the skill editor
 * replaced, and every language drops them together.
 */
const RETIRED = [
  "showInstructions",
  "hideInstructions",
  "integrations",
] as const;

const LANGS = ["en", "es", "pt"] as const;

const locale = (lang: string): { detail: Record<string, string> } =>
  JSON.parse(
    readFileSync(
      new URL(`../src/locales/${lang}/skills.json`, import.meta.url),
      "utf8",
    ),
  );

const sourceFiles = readdirSync(new URL("../src/", import.meta.url), {
  recursive: true,
  withFileTypes: true,
})
  .filter(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")),
  )
  .map((entry) => readFileSync(`${entry.parentPath}/${entry.name}`, "utf8"));

describe("the skills namespace", () => {
  it("asks for none of the retired detail keys", () => {
    for (const key of RETIRED)
      ok(
        !sourceFiles.some((src) => src.includes(`detail.${key}`)),
        `something still renders skills:detail.${key}`,
      );
  });

  it("carries none of them, in any language", () => {
    for (const lang of LANGS)
      for (const key of RETIRED)
        ok(!(key in locale(lang).detail), `${lang} keeps detail.${key}`);
  });
});
