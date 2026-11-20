import { deepStrictEqual, throws } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { parseLocaleJson } from "../scripts/parse-locale-json.mjs";

describe("locale JSON duplicate keys", () => {
  it("rejects repeated keys before the parsed object loses them", () => {
    throws(
      () => parseLocaleJson('{"save":"first","save":"last"}', "en/common.json"),
      {
        message: 'en/common.json: duplicate JSON key at $["save"]',
      },
    );
  });

  it("compares decoded key names", () => {
    throws(
      () =>
        parseLocaleJson(
          String.raw`{"\u0061":"first","a":"last"}`,
          "es/common.json",
        ),
      {
        message: 'es/common.json: duplicate JSON key at $["a"]',
      },
    );
  });

  it("reports nested object and array paths", () => {
    throws(
      () =>
        parseLocaleJson(
          '{"items":[{}, {"label":1,"label":2}]}',
          "pt/common.json",
        ),
      {
        message: 'pt/common.json: duplicate JSON key at $["items"][1]["label"]',
      },
    );
  });

  it("keeps keys in separate objects independent and ignores string content", () => {
    const text = JSON.stringify({
      a: { key: 1 },
      b: [{ key: 2 }],
      text: '"key":1,"key":2',
    });
    deepStrictEqual(parseLocaleJson(text, "common.json"), JSON.parse(text));
  });

  it("preserves JSON syntax validation", () => {
    throws(() => parseLocaleJson('{"a":1,}', "common.json"), SyntaxError);
  });

  it("runs the locale gate against the committed translations", () => {
    execFileSync(process.execPath, ["scripts/check-locales.mjs"], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
    });
  });
});
