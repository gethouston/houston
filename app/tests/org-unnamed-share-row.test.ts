import { doesNotMatch, match } from "node:assert";
import { before, describe, it } from "node:test";
import i18next from "i18next";
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { AgentSharePersonRow } from "../src/components/agent/agent-share-person-row.tsx";
import en from "../src/locales/en/teams.json" with { type: "json" };
import es from "../src/locales/es/teams.json" with { type: "json" };
import pt from "../src/locales/pt/teams.json" with { type: "json" };

Object.assign(globalThis, { React });
const i18n = i18next.createInstance();

before(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    defaultNS: "teams",
    resources: { en: { teams: en }, es: { teams: es }, pt: { teams: pt } },
  });
});

describe("share dialog row for an account with no name or email", () => {
  it("shows the translated label, never the user id", async () => {
    for (const [locale, label] of [
      ["en", "Unnamed account"],
      ["es", "Cuenta sin nombre"],
      ["pt", "Conta sem nome"],
    ] as const) {
      await i18n.changeLanguage(locale);
      const html = renderToStaticMarkup(
        h(
          I18nextProvider,
          { i18n },
          h(AgentSharePersonRow, {
            person: {
              userId: "9q-opaque-account-id",
              orgRole: "admin",
              access: "user",
              isSelf: false,
              isOwner: false,
              canBeManager: true,
            },
            onAction: () => {},
          }),
        ),
      );
      match(html, new RegExp(`>${label}<`));
      doesNotMatch(html, /9q-opaque-account-id/);
      doesNotMatch(html, />9</);
    }
  });
});
