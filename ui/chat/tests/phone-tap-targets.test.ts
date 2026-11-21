import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PromptInputSubmit } from "../src/ai-elements/prompt-input.tsx";
import { Suggestion } from "../src/ai-elements/suggestion.tsx";
import { ChatInputAttachButton } from "../src/chat-input-attach-button.tsx";
import { ChatSuggestActions } from "../src/chat-suggest-actions.tsx";
import { ComposerTrailing } from "../src/composer-trailing.tsx";
import { ConversationActionsMenu } from "../src/conversation-actions-menu.tsx";
import { DEFAULT_CONVERSATION_MAP_LABELS } from "../src/conversation-map-labels.ts";
import { DEFAULT_DICTATION_LABELS } from "../src/dictation-types.ts";

Object.assign(globalThis, { React });
const { createElement } = React;

const MIN_TOUCH_TARGET_PX = 44;
const TAILWIND_UNIT_PX = 4;

const classList = (node: Element | null | undefined): string[] =>
  (node?.getAttribute("class") ?? "").split(/\s+/);

function buttonClasses(element: React.ReactElement, label: string): string[] {
  const doc = new JSDOM(renderToStaticMarkup(element)).window.document;
  const button = doc.querySelector(`button[aria-label="${label}"]`);
  assert.ok(button, `no button labelled ${label}`);
  return classList(button);
}

function assertPhonePress(classes: string[]): void {
  assert.ok(classes.includes("active:scale-[0.96]"), "no press feedback");
  assert.ok(
    classes.includes("md:active:scale-100"),
    "desktop gained a press scale",
  );
  assert.ok(
    classes.includes("transition-all") ||
      classes.some((c) => /^transition-\[.*\bscale\b.*\]$/.test(c)),
    `the press scale snaps: ${classes.join(" ")}`,
  );
}

function boxPx(classes: string[]): number {
  const units = (prefix: string) =>
    classes
      .filter((c) => c.startsWith(prefix))
      .map((c) => Number(c.slice(prefix.length)))
      .filter((n) => Number.isFinite(n));
  const sides = [...units("size-"), ...units("h-"), ...units("w-")];
  assert.ok(sides.length > 0, `no box size in ${classes.join(" ")}`);
  return Math.min(...sides) * TAILWIND_UNIT_PX;
}

function phoneTargetPx(classes: string[]): number {
  const inset = classes.find((c) => c.startsWith("after:-inset-"));
  assert.ok(inset, "no ::after hit-slop");
  const slop = Number(inset.slice("after:-inset-".length)) * TAILWIND_UNIT_PX;
  return boxPx(classes) + 2 * slop;
}

function assertPhoneTarget(classes: string[], press = true): void {
  if (press) assertPhonePress(classes);
  assert.ok(classes.includes("relative"), "hit-slop needs a positioned box");
  assert.ok(classes.includes("after:absolute"));
  assert.ok(
    classes.includes("md:after:hidden"),
    "desktop keeps its own box: the slop must stop at md:",
  );
  assert.ok(
    phoneTargetPx(classes) >= MIN_TOUCH_TARGET_PX,
    `phone target ${phoneTargetPx(classes)}px < ${MIN_TOUCH_TARGET_PX}px`,
  );
}

describe("phone tap targets in chat chrome", () => {
  it("composer send reaches 44px on a phone", () => {
    assertPhoneTarget(
      buttonClasses(createElement(PromptInputSubmit, {}), "Submit"),
    );
  });

  it("composer attach reaches 44px on a phone", () => {
    assertPhoneTarget(
      buttonClasses(
        createElement(ChatInputAttachButton, {
          onOpenFilePicker: () => undefined,
          onOpenFolderPicker: () => undefined,
        }),
        "Attach files",
      ),
    );
  });

  it("the header's chat actions trigger reaches 44px on a phone", () => {
    assertPhoneTarget(
      buttonClasses(
        createElement(ConversationActionsMenu, {
          canFind: true,
          labels: DEFAULT_CONVERSATION_MAP_LABELS,
          onFind: () => undefined,
        }),
        DEFAULT_CONVERSATION_MAP_LABELS.moreActions,
      ),
    );
  });

  it("the suggested actions dismiss reaches 44px on a phone", () => {
    assertPhoneTarget(
      buttonClasses(
        createElement(ChatSuggestActions, {
          actions: [{ id: "a", label: "Summarize", message: "Summarize" }],
          onSelect: () => undefined,
          onDismiss: () => undefined,
        }),
        "Dismiss suggested actions",
      ),
    );
  });
  it("suggestion chips press without a desktop scale", () => {
    assertPhonePress(
      buttonClasses(
        createElement(Suggestion, {
          suggestion: "Summarize",
          "aria-label": "chip",
        }),
        "chip",
      ),
    );
  });

  it("the mic beside send reaches 44px and the two slops never overlap", () => {
    const doc = new JSDOM(
      renderToStaticMarkup(
        createElement(ComposerTrailing, {
          status: "ready",
          hasContent: true,
          dictation: {
            state: "idle",
            onStart: () => undefined,
            onStop: () => undefined,
            onCancel: () => undefined,
            labels: DEFAULT_DICTATION_LABELS,
          },
        }),
      ),
    ).window.document;
    const mic = classList(
      doc.querySelector(
        `button[aria-label="${DEFAULT_DICTATION_LABELS.start}"]`,
      ),
    );
    const send = classList(doc.querySelector('button[aria-label="Submit"]'));
    assertPhoneTarget(mic, false);
    const row = classList(doc.querySelector("button")?.parentElement);
    const gap = row.find((c) => c.startsWith("gap-"));
    assert.ok(gap, "no phone gap");
    const gapPx = Number(gap.slice("gap-".length)) * TAILWIND_UNIT_PX;
    const slopPx = (c: string[]) =>
      Number(
        c
          .find((k) => k.startsWith("after:-inset-"))
          ?.slice("after:-inset-".length),
      ) * TAILWIND_UNIT_PX;
    assert.ok(
      slopPx(mic) + slopPx(send) <= gapPx,
      `hit areas overlap: ${slopPx(mic)} + ${slopPx(send)} > ${gapPx}`,
    );
  });
});
