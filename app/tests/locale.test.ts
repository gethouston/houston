import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeWorkspaceLocale,
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
    ok(!isSupported("EN")); // case-sensitive: normalization is a separate step
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
    strictEqual(resolveEffectiveLocale("fr", "es"), "es"); // invalid override ignored
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
    strictEqual(localeToApply("en", "en"), null); // already active
    strictEqual(localeToApply("pt-BR", "pt"), null); // already active after normalize
    strictEqual(localeToApply(null, "en"), null); // unset
    strictEqual(localeToApply("fr", "en"), null); // unsupported
    strictEqual(localeToApply("", "en"), null); // empty
  });
});

describe("activeWorkspaceLocale", () => {
  const ws = (id: string, isDefault: boolean, locale?: string | null) => ({
    id,
    isDefault,
    locale,
  });

  it("returns null when there are no workspaces", () => {
    strictEqual(activeWorkspaceLocale([], null), null);
    strictEqual(activeWorkspaceLocale([], "anything"), null);
  });

  it("prefers the last-used workspace's override", () => {
    const list = [ws("a", true, "en"), ws("b", false, "pt")];
    strictEqual(activeWorkspaceLocale(list, "b"), "pt");
  });

  it("falls back to the default workspace when last-used is unknown/absent", () => {
    const list = [ws("a", false, "en"), ws("b", true, "pt")];
    strictEqual(activeWorkspaceLocale(list, null), "pt"); // default wins
    strictEqual(activeWorkspaceLocale(list, "ghost"), "pt"); // stale id -> default
  });

  it("falls back to the first workspace when none is default", () => {
    const list = [ws("a", false, "es"), ws("b", false, "pt")];
    strictEqual(activeWorkspaceLocale(list, null), "es");
  });

  it("returns null when the active workspace has no override (inherit global)", () => {
    const list = [ws("a", true), ws("b", false, "pt")];
    strictEqual(activeWorkspaceLocale(list, null), null); // default has no override
    strictEqual(activeWorkspaceLocale(list, "a"), null);
  });
});

describe("localeGateIsLoading", () => {
  it("blocks the first paint until the global preference is loaded and applied", () => {
    ok(localeGateIsLoading(true, false)); // global still loading
    ok(localeGateIsLoading(true, true)); // global loading wins regardless of applied
    ok(localeGateIsLoading(false, false)); // loaded but not yet applied
    strictEqual(localeGateIsLoading(false, true), false); // loaded + applied -> paint
  });

  it("does NOT depend on the best-effort workspace override query (gethouston/houston#439)", () => {
    // The predicate takes no workspace-query argument by design: a non-settling
    // GET /workspaces must never hold the gate. Once the global preference is
    // loaded and applied, the gate releases — there is no third input that a
    // stalled override query could keep true. This is the regression guard for
    // the v0.4.17 launch hang.
    strictEqual(localeGateIsLoading(false, true), false);
  });
});
