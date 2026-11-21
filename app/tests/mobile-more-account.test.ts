import { ok, strictEqual } from "node:assert";
import { registerHooks } from "node:module";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import shell from "../src/locales/en/shell.json" with { type: "json" };

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "./workspace-switcher-face" &&
      context.parentURL?.endsWith("/mobile-more-account.tsx")
    ) {
      const stub =
        'export const SignedInHeader = (p) => globalThis.React.createElement("span", null, p.name, " ", p.email);';
      return {
        url: `data:text/javascript,${encodeURIComponent(stub)}`,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let Page: typeof import("../src/components/shell/mobile-more-account.tsx").MobileMoreAccountPage;

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  render = (await import("react-dom/server")).renderToStaticMarkup;
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["shell"],
    defaultNS: "shell",
    resources: { en: { shell } },
  });
  Page = (await import("../src/components/shell/mobile-more-account.tsx"))
    .MobileMoreAccountPage;
});

type Parts = Parameters<typeof Page>[0]["account"];
const action = (id: Parts["actions"][number]["id"], label: string) => ({
  id,
  label,
  icon: null,
  onSelect: () => undefined,
});
const parts = (over: Partial<Parts>): Parts => ({
  label: "Your account",
  avatar: null,
  header: null,
  personal: null,
  signOut: null,
  identity: null,
  actions: [],
  ...over,
});
const page = (account: Parts) =>
  new JSDOM(render(h(Page, { account, onBack: () => undefined }))).window
    .document;

describe("the More card's account page", () => {
  it("lists the account's actions under a back row, Sign out apart", () => {
    const doc = page(
      parts({
        identity: { name: "Ada Lovelace", email: "ada@example.com" },
        actions: [
          action("profile", "Profile"),
          action("aboutMe", "About me"),
          action("signOut", "Sign out"),
        ],
      }),
    );
    const buttons = [...doc.querySelectorAll("button")];
    strictEqual(
      buttons[0]?.getAttribute("aria-label"),
      "Your account, back to More",
    );
    ok(buttons[0]?.textContent?.includes("Your account"));
    strictEqual(
      buttons
        .slice(1)
        .map((b) => b.textContent)
        .join(","),
      "Profile,About me,Sign out",
    );
    ok(doc.body.textContent?.includes("ada@example.com"));
    const signOut = buttons.at(-1);
    ok(signOut?.parentElement?.className.includes("border-t"));
    strictEqual(doc.querySelectorAll('[role="menu"]').length, 0);
  });

  it("without an identity holds About me alone, no header", () => {
    const doc = page(parts({ actions: [action("aboutMe", "About me")] }));
    const labels = [...doc.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    strictEqual(labels.length, 2);
    strictEqual(labels[1], "About me");
  });
});
