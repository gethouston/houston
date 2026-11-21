import { deepStrictEqual } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const LOCALES = new URL("../src/locales/", import.meta.url);

const namespace = (lang: string, file: string): unknown =>
  JSON.parse(readFileSync(new URL(`${lang}/${file}`, LOCALES), "utf8"));

function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, path ? `${path}.${key}` : key),
  );
}

const BARE_FREE: Record<string, RegExp> = {
  en: /(?<!\{\{)\bfree\b(?! tier)/i,
  es: /\bgratis\b|\bgratuit[oa]s?\b(?<!nivel gratuito)/i,
  pt: /\bgrátis\b|\bgratuit[oa]s?\b(?<!nível gratuito)/i,
};

const OTHER_SENSE = [
  /^ai-hub:/,
  /^providers:/,
  /^migration:offer\.freeNote$/,
  /^teams:billing\.status\.trialing/,
  /^chat:contextCompactedManual$/,
  /^agents:.*saveDiskFull$/,
  /^shell:.*gettingReadyBody$/,
  /^teams:people\.seat\.(yearFree|otherFree|doneFreeOther)/,
  /^teams:billing\.(inUse|freeHelp)/,
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
