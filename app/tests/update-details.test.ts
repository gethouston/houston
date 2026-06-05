import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  normalizeUpdateNotes,
  selectUpdateNotes,
} from "../src/lib/update-details.ts";

describe("normalizeUpdateNotes", () => {
  it("returns null for empty, whitespace, null, and undefined bodies", () => {
    strictEqual(normalizeUpdateNotes(null), null);
    strictEqual(normalizeUpdateNotes(undefined), null);
    strictEqual(normalizeUpdateNotes(""), null);
    strictEqual(normalizeUpdateNotes("   \n  \t "), null);
  });

  it("suppresses the generic Tauri placeholder so the card shows the fallback", () => {
    strictEqual(
      normalizeUpdateNotes("See the assets to download and install this version."),
      null,
    );
  });

  it("normalizes CRLF to LF so markdown blocks parse consistently", () => {
    strictEqual(
      normalizeUpdateNotes("## Houston 0.4.16\r\n\r\nArchive missions."),
      "## Houston 0.4.16\n\nArchive missions.",
    );
  });

  it("trims surrounding whitespace but preserves the markdown body", () => {
    const body = "\n\n## Houston 0.4.16\n\n- Archive missions\n- Manage apps\n\n";
    strictEqual(
      normalizeUpdateNotes(body),
      "## Houston 0.4.16\n\n- Archive missions\n- Manage apps",
    );
  });
});

describe("selectUpdateNotes", () => {
  // Build a body in the shape the release pipeline produces: English base
  // followed by the trailing i18n comment carrying the translations.
  const withI18n = (base: string, translations: Record<string, string>) =>
    `${base}\n\n<!--houston-i18n:${JSON.stringify(translations)}-->\n`;

  it("returns the English base unchanged when there is no i18n marker", () => {
    strictEqual(
      selectUpdateNotes("## Houston 1.0\n\n- Thing", "es"),
      "## Houston 1.0\n\n- Thing",
    );
  });

  it("returns null for empty or generic bodies regardless of locale", () => {
    strictEqual(selectUpdateNotes(null, "es"), null);
    strictEqual(selectUpdateNotes(undefined, "pt"), null);
    strictEqual(selectUpdateNotes("", "es"), null);
    strictEqual(
      selectUpdateNotes("See the assets to download and install this version.", "pt"),
      null,
    );
  });

  it("picks the translation for the active locale", () => {
    const body = withI18n("English notes", {
      es: "Notas en espanol",
      pt: "Notas em portugues",
    });
    strictEqual(selectUpdateNotes(body, "es"), "Notas en espanol");
    strictEqual(selectUpdateNotes(body, "pt"), "Notas em portugues");
  });

  it("shows English for en and for locales without a translation", () => {
    const body = withI18n("English notes", { es: "Notas" });
    strictEqual(selectUpdateNotes(body, "en"), "English notes");
    strictEqual(selectUpdateNotes(body, "pt"), "English notes"); // no pt translation
    strictEqual(selectUpdateNotes(body, "fr"), "English notes"); // unsupported
    strictEqual(selectUpdateNotes(body, null), "English notes");
  });

  it("matches region variants to their base locale (pt-BR -> pt)", () => {
    const body = withI18n("English", { pt: "Portugues" });
    strictEqual(selectUpdateNotes(body, "pt-BR"), "Portugues");
    strictEqual(selectUpdateNotes(body, "es-419"), "English"); // no es here
  });

  it("strips the i18n comment so the marker never leaks into the English body", () => {
    strictEqual(selectUpdateNotes(withI18n("Clean English", { es: "x" }), "en"), "Clean English");
  });

  it("normalizes the chosen translation (CRLF + trim)", () => {
    const body = `English\n\n<!--houston-i18n:${JSON.stringify({
      es: "\r\n## Notas\r\n\r\n- Uno\r\n",
    })}-->\n`;
    strictEqual(selectUpdateNotes(body, "es"), "## Notas\n\n- Uno");
  });

  it("falls back to the English base when the i18n payload is malformed", () => {
    strictEqual(selectUpdateNotes("English\n<!--houston-i18n:{not json-->", "es"), "English");
    strictEqual(selectUpdateNotes('English\n<!--houston-i18n:"a string"-->', "es"), "English");
    strictEqual(selectUpdateNotes("English\n<!--houston-i18n:[1,2]-->", "es"), "English");
  });

  it("treats a marker with no terminator as plain notes", () => {
    const body = 'English body <!--houston-i18n:{"es":"x"}';
    strictEqual(selectUpdateNotes(body, "es"), body);
  });

  // The update card renders the selected notes as markdown. Guard the content
  // contract the renderer depends on: the bullet/number list syntax must reach
  // it byte-intact (the marker split + normalize must not swallow the blank
  // line before a list or rewrite the `- ` / `1. ` line starts), or the
  // markdown parser would never emit <li>s for it to style.
  it("preserves markdown list structure through localization + normalize", () => {
    const en = "## Title\n\n### Added\n\n- One\n- Two\n\n1. First\n2. Second";
    const es = "## Titulo\n\n### Añadido\n\n- Uno\n- Dos\n\n1. Primero\n2. Segundo";
    const body = `${en}\n\n<!--houston-i18n:${JSON.stringify({ es })}-->`;

    const outEn = selectUpdateNotes(body, "en");
    const outEs = selectUpdateNotes(body, "es");
    strictEqual(outEn, en);
    strictEqual(outEs, es);

    for (const out of [outEn, outEs]) {
      const lines = out!.split("\n");
      // blank line before each list survives (loose-list separation)
      ok(out!.includes("\n\n- "), "unordered list keeps its leading blank line");
      ok(out!.includes("\n\n1. "), "ordered list keeps its leading blank line");
      strictEqual(lines.filter((l) => l.startsWith("- ")).length, 2);
      strictEqual(lines.filter((l) => /^\d+\. /.test(l)).length, 2);
    }
  });
});
