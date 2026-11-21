import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const LOCALES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/locales",
);
const LANGS = ["en", "es", "pt"] as const;

const NAMESPACES = ["providerLogin", "claudeLogin"] as const;

const BANNED = [
  /setup-token/i,
  /claude setup-token/i,
  /\bterminal\b/i,
  /command line/i,
  /línea de comandos/i,
  /linha de comando/i,
  /\bCLI\b/,
];

function flatten(value: unknown, path: string, out: Array<[string, string]>) {
  if (typeof value === "string") {
    out.push([path, value]);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, `${path}.${k}`, out);
    }
  }
}

describe("provider sign-in copy is CLI-free", () => {
  for (const lang of LANGS) {
    it(`${lang}/providers.json never mentions a terminal or CLI`, () => {
      const doc = JSON.parse(
        readFileSync(join(LOCALES_DIR, lang, "providers.json"), "utf8"),
      ) as Record<string, unknown>;
      const strings: Array<[string, string]> = [];
      for (const ns of NAMESPACES) {
        assert.ok(doc[ns], `${lang}/providers.json is missing "${ns}"`);
        flatten(doc[ns], ns, strings);
      }
      assert.ok(strings.length > 0);
      for (const [key, text] of strings) {
        for (const pattern of BANNED) {
          assert.ok(
            !pattern.test(text),
            `${lang} ${key} instructs a CLI/terminal action: "${text}" (matched ${pattern})`,
          );
        }
      }
    });
  }

  it("en paste copy points at the Anthropic Console, not a command", () => {
    const doc = JSON.parse(
      readFileSync(join(LOCALES_DIR, "en", "providers.json"), "utf8"),
    ) as { providerLogin: { pasteInstructions: string } };
    assert.match(doc.providerLogin.pasteInstructions, /Anthropic Console/);
  });
});
