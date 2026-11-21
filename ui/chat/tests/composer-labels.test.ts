import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AttachmentChip,
  FolderAttachmentChip,
} from "../src/attachment-chip.tsx";
import { ChatInputForm } from "../src/chat-input-form.tsx";
import { ComposerTrailing } from "../src/composer-trailing.tsx";

Object.assign(globalThis, { React });
const { createElement } = React;

const names = (element: React.ReactElement): string[] =>
  [
    ...new JSDOM(
      renderToStaticMarkup(element),
    ).window.document.querySelectorAll("button"),
  ].map((b) => b.getAttribute("aria-label") ?? "");

const SPANISH = {
  submit: "Enviar",
  stop: "Detener",
  attachFiles: "Adjuntar archivos",
  removeAttachment: (name: string) => `Quitar ${name}`,
};

const form = (
  labels?: typeof SPANISH,
  status: "ready" | "streaming" = "ready",
) =>
  createElement(ChatInputForm, {
    text: "hola",
    placeholder: "",
    status,
    hasContent: true,
    disabled: false,
    dictating: false,
    onSubmit: () => undefined,
    onOpenFilePicker: () => undefined,
    onOpenFolderPicker: () => undefined,
    onTextChange: () => undefined,
    onKeyDown: () => undefined,
    onPaste: () => undefined,
    onSelect: () => undefined,
    onStop: () => undefined,
    labels,
  });

describe("composer control labels", () => {
  it("names send and attach from the caller's labels", () => {
    const got = names(form(SPANISH));
    assert.ok(got.includes("Enviar"), got.join(","));
    assert.ok(got.includes("Adjuntar archivos"), got.join(","));
    assert.ok(!got.includes("Submit") && !got.includes("Attach files"));
  });

  it("names the running turn's stop from the caller's labels", () => {
    assert.ok(names(form(SPANISH, "streaming")).includes("Detener"));
  });

  it("falls back to English without labels", () => {
    const got = names(form());
    assert.ok(got.includes("Submit") && got.includes("Attach files"));
    assert.ok(
      names(
        createElement(ComposerTrailing, {
          status: "streaming",
          hasContent: false,
          onStop: () => undefined,
        }),
      ).includes("Stop"),
    );
  });

  it("names each chip's remove button for its file or folder", () => {
    assert.deepEqual(
      names(
        createElement(AttachmentChip, {
          name: "q3.pdf",
          onRemove: () => undefined,
          removeLabel: SPANISH.removeAttachment,
        }),
      ),
      ["Quitar q3.pdf"],
    );
    assert.deepEqual(
      names(
        createElement(FolderAttachmentChip, {
          name: "fotos",
          countLabel: "3 archivos",
          onRemove: () => undefined,
          removeLabel: SPANISH.removeAttachment,
        }),
      ),
      ["Quitar fotos"],
    );
    assert.deepEqual(
      names(
        createElement(AttachmentChip, {
          name: "q3.pdf",
          onRemove: () => undefined,
        }),
      ),
      ["Remove q3.pdf"],
    );
  });
});
