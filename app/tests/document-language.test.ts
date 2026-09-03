import { strictEqual } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { bindDocumentLanguage } from "../src/lib/document-language.ts";

// <html lang> must follow the active locale: index.html ships "en" for the
// pre-JS frame, and a Spanish screen labelled English invites translation.

interface FakeI18n {
  language: string | undefined;
  handlers: Array<(lng: string) => void>;
  on(event: string, handler: (lng: string) => void): void;
}

function fakeI18n(language: string | undefined): FakeI18n {
  return {
    language,
    handlers: [],
    on(event, handler) {
      if (event === "languageChanged") this.handlers.push(handler);
    },
  };
}

let root: { lang: string };
beforeEach(() => {
  root = { lang: "en" };
  globalThis.document = { documentElement: root } as unknown as Document;
});
afterEach(() => {
  // @ts-expect-error — tear down the fake between tests.
  globalThis.document = undefined;
});

const bind = (i18n: FakeI18n) =>
  bindDocumentLanguage(
    i18n as unknown as Parameters<typeof bindDocumentLanguage>[0],
  );

describe("bindDocumentLanguage", () => {
  it("applies the already-resolved language on bind", () => {
    bind(fakeI18n("pt"));
    strictEqual(root.lang, "pt");
  });
  it("keeps the document default until the first language resolves", () => {
    const i18n = fakeI18n(undefined);
    bind(i18n);
    strictEqual(root.lang, "en");
    i18n.handlers[0]?.("es");
    strictEqual(root.lang, "es");
  });
  it("follows later locale changes", () => {
    const i18n = fakeI18n("en");
    bind(i18n);
    i18n.handlers[0]?.("es");
    strictEqual(root.lang, "es");
  });
});
