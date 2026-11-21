import { ok } from "node:assert";
import { registerHooks } from "node:module";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import auth from "../src/locales/en/auth.json" with { type: "json" };

const STUBS: Record<string, string> = {
  "../../lib/auth":
    "export const sendEmailOtp = async () => {}; export const verifyEmailOtp = async () => {};",
  "../../lib/tauri": "export const tauriSystem = { openUrl: async () => {} };",
  "../../lib/logger":
    "export const logger = { error() {}, warn() {}, info() {} };",
};
registerHooks({
  resolve(specifier, context, next) {
    const stub = context.parentURL?.includes("/components/auth/")
      ? STUBS[specifier]
      : undefined;
    if (stub === undefined) return next(specifier, context);
    return {
      url: `data:text/javascript,${encodeURIComponent(stub)}`,
      shortCircuit: true,
    };
  },
});

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let mods: {
  row: typeof import("../src/components/auth/provider-button-row.tsx");
  email: typeof import("../src/components/auth/email-sign-in.tsx");
  legal: typeof import("../src/components/auth/sign-in-panels.tsx");
};

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  render = (await import("react-dom/server")).renderToStaticMarkup;
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["auth"],
    defaultNS: "auth",
    resources: { en: { auth } },
  });
  mods = {
    row: await import("../src/components/auth/provider-button-row.tsx"),
    email: await import("../src/components/auth/email-sign-in.tsx"),
    legal: await import("../src/components/auth/sign-in-panels.tsx"),
  };
});

const classesOf = (element: ReactElement, selector: string): string[][] =>
  [
    ...new JSDOM(render(element)).window.document.querySelectorAll(selector),
  ].map((node) => (node.getAttribute("class") ?? "").split(/\s+/));

function assertPhonePress(c: string[]): void {
  ok(c.includes("active:scale-[0.96]"), "press feedback");
  ok(c.includes("md:active:scale-100"), "desktop keeps no press scale");
  ok(
    c.includes("transition-all") ||
      c.some((k) => /^transition-\[.*\bscale\b.*\]$/.test(k)),
    `press scale snaps: ${c.join(" ")}`,
  );
}

describe("sign-in phone tap targets", () => {
  it("provider pills are 44px on a phone and 40px from md", () => {
    const pills = classesOf(
      h(mods.row.ProviderButtonRow, {
        pending: null,
        onSignIn: () => () => undefined,
      }),
      "button",
    );
    ok(pills.length > 0);
    for (const c of pills) {
      ok(c.includes("h-11") && c.includes("md:h-10"), c.join(" "));
      ok(!c.includes("flex-1") && c.includes("md:flex-1"), c.join(" "));
      assertPhonePress(c);
    }
  });

  it("on a phone every provider stacks full width with its label", () => {
    const html = render(
      h(mods.row.ProviderButtonRow, {
        pending: null,
        onSignIn: () => () => undefined,
      }),
    );
    const doc = new JSDOM(html).window.document;
    const row = (doc.body.firstElementChild?.getAttribute("class") ?? "").split(
      /\s+/,
    );
    ok(row.includes("flex-col") && row.includes("md:flex-row"), row.join(" "));
    const buttons = [...doc.querySelectorAll("button")];
    ok(buttons.length === 3);
    for (const button of buttons) {
      const label = button.getAttribute("aria-label") ?? "";
      const span = button.querySelector("span.md\\:hidden");
      ok(span?.textContent === label, `${label}: no phone label`);
      ok(/^Continue with (Google|Apple|Microsoft)$/.test(label));
      ok(button.getAttribute("class") === buttons[0]?.getAttribute("class"));
    }
  });

  it("the address field and its send button are 44px on a phone", () => {
    const form = h(mods.email.EmailSignIn, { submitFilled: true });
    const [field] = classesOf(form, "input[type=email]");
    const [send] = classesOf(form, "button[type=submit]");
    ok(field?.includes("h-11") && field.includes("md:h-10"));
    ok(send?.includes("size-11") && send.includes("md:size-10"));
    assertPhonePress(send);
  });

  it("legal links reach 44px on a phone without a desktop slop", () => {
    const links = classesOf(h(mods.legal.LegalFooter), "button");
    ok(links.length === 2);
    for (const c of links) {
      ok(c.includes("after:-inset-y-3.5") && c.includes("md:after:hidden"));
      ok(c.includes("relative") && c.includes("after:absolute"));
    }
  });
});
