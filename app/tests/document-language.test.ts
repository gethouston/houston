import { strictEqual } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { bindDocumentLanguage } from "../src/lib/document-language.ts";

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

const bind = (i18n: FakeI18n) =>
  bindDocumentLanguage(
    i18n as unknown as Parameters<typeof bindDocumentLanguage>[0],
  );

describe("bindDocumentLanguage", () => {
  let root: { lang: string };
  let original: PropertyDescriptor | undefined;
  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, "document");
    root = { lang: "en" };
    globalThis.document = { documentElement: root } as unknown as Document;
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  });

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
