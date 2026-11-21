import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSupported,
  localeGateIsLoading,
  localeToApply,
  normalizeLocale,
  resolveEffectiveLocale,
} from "../src/lib/locale.ts";

describe("isSupported", () => {
  it("accepts the three shipped locales only", () => {
    ok(isSupported("en"));
    ok(isSupported("es"));
    ok(isSupported("pt"));
    ok(!isSupported("fr"));
    ok(!isSupported("EN"));
    ok(!isSupported(null));
    ok(!isSupported(undefined));
    ok(!isSupported(123));
  });
});

describe("normalizeLocale", () => {
  it("maps BCP-47 tags to a supported base tag", () => {
    strictEqual(normalizeLocale("en"), "en");
    strictEqual(normalizeLocale("pt-BR"), "pt");
    strictEqual(normalizeLocale("es-ES"), "es");
    strictEqual(normalizeLocale("es_419"), "es");
    strictEqual(normalizeLocale("EN"), "en");
    strictEqual(normalizeLocale("PT-br"), "pt");
  });

  it("returns null for unsupported / empty / missing values", () => {
    strictEqual(normalizeLocale("fr"), null);
    strictEqual(normalizeLocale("english"), null);
    strictEqual(normalizeLocale(""), null);
    strictEqual(normalizeLocale(null), null);
    strictEqual(normalizeLocale(undefined), null);
  });
});

describe("resolveEffectiveLocale", () => {
  it("prefers a valid workspace override over the global default", () => {
    strictEqual(resolveEffectiveLocale("es", "en"), "es");
    strictEqual(resolveEffectiveLocale("pt-BR", "en"), "pt");
  });

  it("falls back to the global default when the workspace has no valid override", () => {
    strictEqual(resolveEffectiveLocale(null, "pt"), "pt");
    strictEqual(resolveEffectiveLocale(undefined, "en"), "en");
    strictEqual(resolveEffectiveLocale("fr", "es"), "es");
    strictEqual(resolveEffectiveLocale("", "es"), "es");
  });

  it("returns null when neither source is set/valid (keep detector pick)", () => {
    strictEqual(resolveEffectiveLocale(null, null), null);
    strictEqual(resolveEffectiveLocale(undefined, undefined), null);
    strictEqual(resolveEffectiveLocale("fr", "de"), null);
  });
});

describe("localeToApply", () => {
  it("returns the normalized target when it differs from the active language", () => {
    strictEqual(localeToApply("es", "en"), "es");
    strictEqual(localeToApply("pt-BR", "en"), "pt");
    strictEqual(localeToApply("es", undefined), "es");
    strictEqual(localeToApply("en", "es"), "en");
  });

  it("returns null to leave the language untouched", () => {
    strictEqual(localeToApply("en", "en"), null);
    strictEqual(localeToApply("pt-BR", "pt"), null);
    strictEqual(localeToApply(null, "en"), null);
    strictEqual(localeToApply("fr", "en"), null);
    strictEqual(localeToApply("", "en"), null);
  });
});

describe("localeGateIsLoading", () => {
  it("blocks the first paint until the global preference is loaded and applied", () => {
    ok(localeGateIsLoading(true, false));
    ok(localeGateIsLoading(true, true));
    ok(localeGateIsLoading(false, false));
    strictEqual(localeGateIsLoading(false, true), false);
  });

  it("does NOT depend on the best-effort workspace override query (gethouston/houston#439)", () => {
    strictEqual(localeGateIsLoading(false, true), false);
  });
});
