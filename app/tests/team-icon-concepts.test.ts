import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
// The source modules directly, not the `@houston-ai/layout` barrel: its imports
// are extensionless (the bundler's convention in `ui/`), which node's own ESM
// loader cannot resolve.
import {
  matchesSidebarGroupGlyph,
  sidebarGroupGlyphConcepts,
} from "../../ui/layout/src/sidebar-group-glyph-search.ts";
import { SIDEBAR_GROUP_GLYPH_TAGS } from "../../ui/layout/src/sidebar-group-glyph-tags.ts";
import en from "../src/locales/en/shell.json" with { type: "json" };
import es from "../src/locales/es/shell.json" with { type: "json" };
import pt from "../src/locales/pt/shell.json" with { type: "json" };

// The picker searches CONCEPTS, not only names: "money" surfaces the finance
// marks. Those concepts are curated in English inside `ui/layout` (which is
// i18n-free by boundary), so the only way a Spanish reader's "dinero" reaches
// them is `shell:sidebar.teamIconConcepts.<tag>` translated app-side and handed
// to the matcher. A template-literal key is NOT checked by the react-i18next
// type augmentation, so a missing one would ship the raw key as a haystack word
// and quietly narrow the search instead of failing the build. This is the check
// that keeps the tag vocabulary and the three locales moving together.

type GlyphName = keyof typeof SIDEBAR_GROUP_GLYPH_TAGS;

const NAMES = Object.keys(SIDEBAR_GROUP_GLYPH_TAGS) as GlyphName[];
// Every word the app must be able to translate: what the library says each
// mark is ABOUT, not merely the curated tags (a mark named after a concept
// carries that concept in its name instead of its tags).
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

  it("en keeps each tag as itself, so the source stays the source", () => {
    for (const tag of VOCABULARY) {
      strictEqual(conceptsOf(en)[tag], tag);
    }
  });

  // The other half of the same promise, and the one that rots silently: the
  // matcher reads every mark's NAME in English, always, so each word of each
  // name is a handle an English reader gets for free. That word reaches a
  // Spanish or Portuguese reader only two ways. Either it is a CONCEPT, and
  // the block above proves it is translated; or the mark's own English LABEL
  // already says it, and the es/pt labels carry its translation because they
  // translate that same label ("airplane" is labelled Airplane, hence Avión).
  // A name word that is neither is English-only: `music-tape` is labelled
  // "Cassette tape", and nothing in "Casete" answers "música". Adding a mark
  // whose slug says more than its label fails here until the word is curated
  // into `NAME_WORD_CONCEPTS` and translated.
  it("leaves no name word reachable in English alone", () => {
    // Both sides are English here, so lowercasing is the whole normalization
    // the matcher's fold would do.
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

  // The picker's own filter, rebuilt from the real locale data: the glyph's
  // localized concepts are what it hands the matcher as an extra haystack.
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
    // The English tags live on in the matcher's own haystack: a Spanish reader
    // who types the English word must not hit an empty grid.
    const money = surfacedBy("es", "money");
    for (const name of FINANCE) ok(money.includes(name), `money: ${name}`);
    ok(!dinero.includes("rocket"), "dinero must not surface every mark");
  });

  it("pt: dinheiro surfaces the finance set", () => {
    const dinheiro = surfacedBy("pt", "dinheiro");
    for (const name of FINANCE) ok(dinheiro.includes(name), `pt: ${name}`);
    ok(!dinheiro.includes("rocket"), "dinheiro must not surface every mark");
  });
});
