import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { registerHooks } from "node:module";
import { before, describe, it } from "node:test";
import type { AccountLinkView } from "@houston/sdk/identity";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import auth from "../src/locales/en/auth.json" with { type: "json" };
import errors from "../src/locales/en/errors.json" with { type: "json" };

// lib/auth and its neighbours read `import.meta.env` (Vite-only) when they
// load, so the node runner stubs them; these specs only render.
const STUBS: Record<string, string> = {
  "../../lib/auth":
    "export const confirmAccountLink = async () => ({ kind: 'linked' }); export const identityClient = {};",
  "../../lib/account-link":
    "export const PROVIDER_NAME = { 'google.com': 'Google', 'microsoft.com': 'Microsoft', 'apple.com': 'Apple' };",
  "../../lib/error-toast": "export const showErrorToast = () => false;",
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
let panel: typeof import("../src/components/auth/account-link-panel.tsx");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  render = (await import("react-dom/server")).renderToStaticMarkup;
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["auth", "errors"],
    defaultNS: "auth",
    resources: { en: { auth, errors } },
  });
  panel = await import("../src/components/auth/account-link-panel.tsx");
});

const textsOf = (element: ReactElement, selector: string): string[] =>
  [
    ...new JSDOM(render(element)).window.document.querySelectorAll(selector),
  ].map((node) => node.textContent ?? "");

describe("account link panel", () => {
  it("names the account's address and the provider being added", () => {
    const view = {
      status: "needs_code",
      provider: "microsoft.com",
      email: "p@example.com",
      codeError: "otp_invalid_code",
    } as const;
    const element = h(panel.AccountLinkPanel, { view });
    deepStrictEqual(textsOf(element, "h2, p"), [
      "You already have a Houston account",
      "You already have a Houston account with p@example.com. We sent a code there. Enter it to add Microsoft sign-in to that account.",
      "We sent a 6-digit code to p@example.com.",
      "That code is wrong or expired. Request a new one and try again.",
    ]);
    deepStrictEqual(textsOf(element, "button[type=button]"), [
      "Resend code",
      "Back to sign in",
    ]);
  });

  it("lets the person go back while the code is still being sent, not while it is checked", () => {
    const buttons = (status: "sending_code" | "verifying" | "linking") =>
      [
        ...new JSDOM(
          render(
            h(panel.AccountLinkPanel, {
              view: { status, provider: "google.com", email: "p@example.com" },
            }),
          ),
        ).window.document.querySelectorAll("button[type=button]"),
      ].map((b) => [b.textContent, b.hasAttribute("disabled")]);
    deepStrictEqual(buttons("sending_code"), [
      ["Resend code", true],
      ["Back to sign in", false],
    ]);
    for (const status of ["verifying", "linking"] as const)
      deepStrictEqual(buttons(status), [
        ["Resend code", true],
        ["Back to sign in", true],
      ]);
  });

  it("shows the gateway's account refusals as copy the person can act on", () => {
    const shown = (codeError: string) =>
      textsOf(
        h(panel.AccountLinkPanel, {
          view: {
            status: "needs_code",
            provider: "apple.com",
            email: "p@example.com",
            codeError,
          } as AccountLinkView & { status: "needs_code" },
        }),
        "p",
      ).at(-1);
    strictEqual(
      shown("otp_unverified_account"),
      "This email is waiting to be confirmed on another account. Sign in the way you usually do, or contact support.",
    );
    strictEqual(
      shown("otp_email_changed"),
      "This email isn't the one on that account anymore. Sign in with the account's current email, or contact support.",
    );
    strictEqual(
      shown("otp_account_merging"),
      "We're updating this account. Request a new code in a couple of minutes.",
    );
    strictEqual(
      shown("otp_account_disabled"),
      "This account has been disabled. Contact support.",
    );
  });

  it("takes over the options only while the code step runs", () => {
    const at = (status: AccountLinkView["status"]) =>
      panel.isLinkActive({
        status,
        provider: "google.com",
        email: "p@example.com",
        codeError: null,
        refusal: "link_failed",
      } as AccountLinkView);
    deepStrictEqual(
      [
        "idle",
        "sending_code",
        "needs_code",
        "verifying",
        "linking",
        "linked",
        "refused",
      ].map((s) => at(s as AccountLinkView["status"])),
      [false, true, true, true, true, false, false],
    );
  });

  it("explains a stopped link on the sign-in screen, except a taken identity", () => {
    const Notice = ({ view }: { view: AccountLinkView }) =>
      h("p", null, panel.useAccountLinkNotice(view));
    const notice = (view: AccountLinkView) =>
      textsOf(h(Notice, { view }), "p")[0];
    strictEqual(
      notice({
        status: "refused",
        provider: "google.com",
        email: "p@example.com",
        refusal: "link_expired",
      }),
      "That took too long. Sign in with Google again.",
    );
    strictEqual(
      notice({
        status: "refused",
        provider: "apple.com",
        email: null,
        refusal: "link_email_unknown",
      }),
      "We couldn't confirm the email for that Apple account. Sign in with your email code instead.",
    );
    strictEqual(
      notice({
        status: "refused",
        provider: "microsoft.com",
        email: "p@example.com",
        refusal: "link_wrong_account",
      }),
      "We couldn't add Microsoft sign-in. Try again, or sign in with your email code.",
    );
    strictEqual(
      notice({
        status: "refused",
        provider: "google.com",
        email: "p@example.com",
        refusal: "link_identity_taken",
      }),
      "",
    );
  });
});
