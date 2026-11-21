import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesSidebarGroupGlyph,
  sidebarGroupGlyphConcepts,
} from "../../ui/layout/src/sidebar-group-glyph-search.ts";
import { SIDEBAR_GROUP_GLYPH_TAGS } from "../../ui/layout/src/sidebar-group-glyph-tags.ts";
import en from "../src/locales/en/shell.json" with { type: "json" };
import es from "../src/locales/es/shell.json" with { type: "json" };
import pt from "../src/locales/pt/shell.json" with { type: "json" };

type GlyphName = keyof typeof SIDEBAR_GROUP_GLYPH_TAGS;

const NAMES = Object.keys(SIDEBAR_GROUP_GLYPH_TAGS) as GlyphName[];
const VOCABULARY = [
  ...new Set(NAMES.flatMap((name) => sidebarGroupGlyphConcepts(name))),
].sort();
const LOCALES = { en, es, pt } as const;

function conceptsOf(
  bundle: (typeof LOCALES)[keyof typeof LOCALES],
): Record<string, string> {
  return (bundle as { sidebar: { teamIconConcepts: Record<string, string> } })
    .sidebar.teamIconConcepts;
}

function labelsOf(
  bundle: (typeof LOCALES)[keyof typeof LOCALES],
): Record<string, string> {
  return (bundle as { sidebar: { teamIcons: Record<string, string> } }).sidebar
    .teamIcons;
}

describe("team icon concepts", () => {
  for (const [lang, bundle] of Object.entries(LOCALES)) {
    const concepts = conceptsOf(bundle);

    it(`${lang}: translates every tag and nothing else`, () => {
      for (const tag of VOCABULARY) {
        const word = concepts[tag];
        ok(
          typeof word === "string" && word.trim().length > 0,
          `${lang}: sidebar.teamIconConcepts.${tag} is missing`,
        );
      }
      strictEqual(
        Object.keys(concepts)
          .filter((key) => !VOCABULARY.includes(key))
          .join(", "),
        "",
        `${lang}: sidebar.teamIconConcepts translates tags that no longer exist`,
      );
    });
  }

  it("en keeps source tags except the folder concept's user-facing name", () => {
    for (const tag of VOCABULARY) {
      strictEqual(conceptsOf(en)[tag], tag === "team" ? "group team" : tag);
    }
  });

  it("leaves no name word reachable in English alone", () => {
    const says = (label: string, word: string) =>
      label.toLowerCase().includes(word);
    const orphans = NAMES.flatMap((name) =>
      name
        .split("-")
        .filter(
          (word) =>
            !VOCABULARY.includes(word) && !says(labelsOf(en)[name], word),
        )
        .map((word) => `${name}: "${word}"`),
    );
    strictEqual(
      orphans.join(", "),
      "",
      "name words with no es/pt equivalent, in neither the concepts nor the label",
    );
  });

  it("gives every mark a label in all three locales", () => {
    for (const [lang, bundle] of Object.entries(LOCALES)) {
      const labels = labelsOf(bundle);
      for (const name of NAMES) {
        ok(
          typeof labels[name] === "string" && labels[name].trim().length > 0,
          `${lang}: sidebar.teamIcons.${name} is missing`,
        );
      }
    }
  });

  function surfacedBy(lang: keyof typeof LOCALES, query: string): GlyphName[] {
    const concepts = conceptsOf(LOCALES[lang]);
    return NAMES.filter((name) =>
      matchesSidebarGroupGlyph(
        name,
        query,
        sidebarGroupGlyphConcepts(name)
          .map((tag) => concepts[tag])
          .join(" "),
      ),
    );
  }

  const FINANCE = [
    "bank",
    "dollar",
    "euro",
    "dollar-bill",
    "money-stack",
  ] as const;

  it("es: dinero surfaces the finance set, and so does money", () => {
    const dinero = surfacedBy("es", "dinero");
    for (const name of FINANCE) ok(dinero.includes(name), `dinero: ${name}`);
    const money = surfacedBy("es", "money");
    for (const name of FINANCE) ok(money.includes(name), `money: ${name}`);
    ok(!dinero.includes("rocket"), "dinero must not surface every mark");
  });

  it("pt: dinheiro surfaces the finance set", () => {
    const dinheiro = surfacedBy("pt", "dinheiro");
    for (const name of FINANCE) ok(dinheiro.includes(name), `pt: ${name}`);
    ok(!dinheiro.includes("rocket"), "dinheiro must not surface every mark");
  });

  it("finds the team marks by both group and team in every locale", () => {
    const teamMarks = NAMES.filter((name) =>
      sidebarGroupGlyphConcepts(name).includes("team"),
    );
    ok(teamMarks.length > 0, "some mark carries the team concept");
    const queries = {
      en: ["group", "team"],
      es: ["grupo", "equipo"],
      pt: ["grupo", "time", "equipe"],
    } as const;
    for (const [lang, words] of Object.entries(queries)) {
      for (const word of words) {
        const found = surfacedBy(lang as keyof typeof LOCALES, word);
        for (const name of teamMarks) {
          ok(found.includes(name), `${lang} "${word}": ${name}`);
        }
      }
    }
  });
});
