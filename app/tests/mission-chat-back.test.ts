import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import i18next from "i18next";
import { JSDOM } from "jsdom";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initReactI18next } from "react-i18next";
import { MissionChatBack } from "../src/components/mission-chat/mission-chat-back.tsx";
import shell from "../src/locales/en/shell.json" with { type: "json" };

Object.assign(globalThis, { React });

before(async () => {
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["shell"],
    defaultNS: "shell",
    resources: { en: { shell } },
  });
});

describe("mission chat back control", () => {
  it("reaches a 44px phone target without changing the desktop box", () => {
    const html = renderToStaticMarkup(createElement(MissionChatBack));
    const button = new JSDOM(html).window.document.querySelector(
      '[data-testid="mission-chat-back"]',
    );
    ok(button);
    const classes = (button.getAttribute("class") ?? "").split(/\s+/);
    strictEqual(button.getAttribute("aria-label"), shell.missionChat.back);
    ok(classes.includes("size-9"), "36px box");
    ok(classes.includes("relative") && classes.includes("after:absolute"));
    ok(classes.includes("after:-inset-1"), "36 + 2 x 4 = 44px");
    ok(classes.includes("md:after:hidden"), "no slop at the desktop edge");
    ok(classes.includes("active:scale-[0.96]"), "phone press feedback");
    ok(classes.includes("md:active:scale-95"), "desktop keeps its 0.95 press");
    ok(classes.includes("md:transition-colors"), "desktop press stays instant");
    ok(
      classes.some((c) => /^transition-\[.*\bscale\b.*\]$/.test(c)),
      "the press scale animates",
    );
  });
});
