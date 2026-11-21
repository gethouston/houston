import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const BOOT_READERS = ["../src/hooks/use-houston-init.ts"];

describe("boot readers of a device preference", () => {
  for (const file of BOOT_READERS) {
    it(`${file} reads through readBootPreference, never tauriPreferences.get`, () => {
      const source = read(file);
      ok(
        source.includes('from "../lib/boot-preference"'),
        `${file} must import the shared boot read`,
      );
      ok(
        source.includes("readBootPreference("),
        `${file} must call readBootPreference`,
      );
      strictEqual(
        source.includes("tauriPreferences.get("),
        false,
        `${file} must not read a preference straight off the barrel: the rejection would reach the load's catch`,
      );
    });

    it(`${file} does not swallow the read with a console.error`, () => {
      const source = read(file);
      strictEqual(
        /console\.error\((?:.|\n)*?(?:preference|workspace|agent)/i.test(
          source,
        ),
        false,
        `${file} must report a failed read (logAndReportError via readBootPreference), not log it`,
      );
    });
  }

  it("readBootPreference reports with a device_pref_unreadable code", () => {
    const source = read("../src/lib/boot-preference.ts");
    ok(
      /logAndReportError\(`device_pref_unreadable:\$\{key\}`/.test(source),
      "the report names the failure and the key",
    );
    ok(
      source.includes("return null;"),
      "an unreadable device preference resolves as unset",
    );
  });
});
