import { doesNotMatch, equal, match } from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import type { ReactElement } from "react";
import en from "../src/locales/en/auth.json" with { type: "json" };
import { enterNativeApp } from "./support/native-surface.ts";

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let row: typeof import("../src/components/auth/provider-button-row.tsx");
let referral: typeof import("../src/components/auth/referral-panel.tsx").ReferralPanel;
let setShell: typeof import("../../packages/web/src/shims/native-shell.ts").setNativeShell;
let leave: (() => void) | null = null;

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
    resources: { en: { auth: en } },
  });
  row = await import("../src/components/auth/provider-button-row.tsx");
  referral = (await import("../src/components/auth/referral-panel.tsx"))
    .ReferralPanel;
  setShell = (await import("../../packages/web/src/shims/native-shell.ts"))
    .setNativeShell;
});

afterEach(() => {
  leave?.();
  leave = null;
  setShell(null);
});

const buttonRow = () =>
  render(
    h(row.ProviderButtonRow, {
      pending: null,
      onSignIn: () => () => undefined,
    }),
  );

describe("native sign-in options", () => {
  it("keeps every provider in a browser and on desktop", () => {
    const html = buttonRow();
    match(html, /Continue with Google/);
    match(html, /Continue with Apple/);
    match(html, /Continue with Microsoft/);
  });

  it("shows only configured native providers", () => {
    leave = enterNativeApp();
    setShell({
      identity: { providers: { google: true, apple: false, azure: false } },
      openUrl: async () => true,
      push: {
        available: false,
        permissionState: async () => "denied",
        requestPermission: async () => "denied",
        getToken: async () => "",
        deleteToken: async () => undefined,
        onTokenRefresh: async () => async () => undefined,
        onNotificationTap: async () => async () => undefined,
      },
    });
    const html = buttonRow();
    match(html, /Continue with Google/);
    doesNotMatch(html, /Continue with Apple|Continue with Microsoft/);
  });

  it("hides the referral card inside a native app", () => {
    match(render(h(referral, {})), /Share the love/);
    leave = enterNativeApp();
    equal(render(h(referral, {})), "");
  });
});
