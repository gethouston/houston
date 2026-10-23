import { deepStrictEqual } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const LOCALES = new URL("../src/locales/", import.meta.url);

// Read, not imported: a JSON module whose top-level key is `arguments`
// cannot be loaded as an ES module.
const namespace = (lang: string, file: string): unknown =>
  JSON.parse(readFileSync(new URL(`${lang}/${file}`, LOCALES), "utf8"));

/** Every string leaf of a locale namespace, keyed by its dotted path. */
function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, path ? `${path}.${key}` : key),
  );
}

// A bare "free" reads as unlimited forever. Our plan is always "the free
// tier", which has a weekly limit.
const BARE_FREE: Record<string, RegExp> = {
  en: /(?<!\{\{)\bfree\b(?! tier)/i,
  es: /\bgratis\b|\bgratuit[oa]s?\b(?<!nivel gratuito)/i,
  pt: /\bgrátis\b|\bgratuit[oa]s?\b(?<!nível gratuito)/i,
};

// Free in another sense: disk space, "feel free", a free trial, a third
// party's own free plan or account, a migration that costs nothing.
const OTHER_SENSE = [
  /^ai-hub:/,
  /^providers:/,
  /^migration:offer\.freeNote$/,
  /^teams:billing\.status\.trialing/,
  /^chat:contextCompactedManual$/,
  /^agents:.*saveDiskFull$/,
  /^shell:.*gettingReadyBody$/,
];

describe("plan copy", () => {
  for (const lang of Object.keys(BARE_FREE)) {
    it(`never says free without the tier (${lang})`, () => {
      const files = readdirSync(new URL(`${lang}/`, LOCALES));
      const bare = files.flatMap((file) =>
        leaves(namespace(lang, file))
          .map(([key, text]) => [`${file.replace(".json", "")}:${key}`, text])
          .filter(([, text]) => BARE_FREE[lang].test(text))
          .filter(([id]) => !OTHER_SENSE.some((sense) => sense.test(id)))
          .map(([id, text]) => `${id}: ${text}`),
      );
      deepStrictEqual(bare, []);
    });
  }
});
