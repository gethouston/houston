import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import { UNSAVED_FILE_REASONS } from "@houston/wire-types";
import type { ReactElement } from "react";
import en from "../src/locales/en/chat.json" with { type: "json" };
import es from "../src/locales/es/chat.json" with { type: "json" };
import pt from "../src/locales/pt/chat.json" with { type: "json" };

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let note: typeof import("../src/components/files-not-saved-note.tsx");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  const markup = (await import("react-dom/server")).renderToStaticMarkup;
  const i18n = (await import("i18next")).default.createInstance();
  const { I18nextProvider, initReactI18next } = await import("react-i18next");
  await i18n.use(initReactI18next).init({
    lng: "en",
    ns: ["chat"],
    defaultNS: "chat",
    resources: { en: { chat: en } },
    interpolation: { escapeValue: false },
  });
  render = (element) => markup(h(I18nextProvider, { i18n }, element));
  note = await import("../src/components/files-not-saved-note.tsx");
});

describe("files not saved note", () => {
  it("has copy for every reason in every shipped language", () => {
    for (const bundle of [en, es, pt]) {
      const copy = bundle.filesNotSaved as Record<string, string>;
      for (const key of ["title", ...UNSAVED_FILE_REASONS]) {
        strictEqual(typeof copy[key], "string", key);
        strictEqual(copy[key].includes("—"), false, key);
      }
    }
  });

  it("names each file and where the agent's copy went", () => {
    const html = render(
      h(note.FilesNotSavedNote, {
        data: {
          unsavedFiles: {
            files: [
              {
                path: "plans/q3.md",
                reason: "conflict_copy",
                copyPath: "plans/q3 (conflict 2026-11-22).md",
              },
              { path: "big.zip", reason: "too_large" },
            ],
            total: 2,
            counts: { conflict_copy: 1, too_large: 1 },
          },
        },
      }),
    );
    ok(html.includes(en.filesNotSaved.title), html);
    ok(html.includes("plans/q3 (conflict 2026-11-22).md"), html);
    ok(html.includes("big.zip is too large to save"), html);
  });

  it("draws nothing without files", () => {
    strictEqual(render(h(note.FilesNotSavedNote, { data: undefined })), "");
  });
});
