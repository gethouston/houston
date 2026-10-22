import { doesNotMatch, match, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import i18next from "i18next";
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { AgentPersonRow } from "../src/components/agent-settings/agent-person-row.tsx";
import { chartPerson } from "../src/components/organization/org-chart-people.ts";
import { shareCardLayout } from "../src/components/organization/org-chart-share-layout.ts";
import { shareCardCaps } from "../src/components/organization/org-chart-share-model.ts";
import {
  buildOrgTree,
  SCREEN_TREE_CAPS,
} from "../src/components/organization/org-chart-tree.ts";
import { OrgChartTreeView } from "../src/components/organization/org-chart-tree-view.tsx";
import { buildLedger } from "../src/components/organization/org-chart-view-model.ts";
import { PeopleRosterRow } from "../src/components/organization/people-roster-row.tsx";
import {
  initialsFor,
  personDisplayName,
  rosterPersonName,
} from "../src/components/organization/people-tab-model.ts";
import en from "../src/locales/en/teams.json" with { type: "json" };
import es from "../src/locales/es/teams.json" with { type: "json" };
import pt from "../src/locales/pt/teams.json" with { type: "json" };

Object.assign(globalThis, { React });
const i18n = i18next.createInstance();
const member: OrgMember = { userId: "9q-opaque-account-id", role: "owner" };
const employee = {
  id: "employee",
  name: "Employee",
  folderPath: "employee",
  configId: "c",
  createdAt: "2026-01-01",
  access: "manager" as const,
};
const locales = [
  ["en", "Unnamed account"],
  ["es", "Cuenta sin nombre"],
  ["pt", "Conta sem nome"],
] as const;

before(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    defaultNS: "teams",
    resources: { en: { teams: en }, es: { teams: es }, pt: { teams: pt } },
  });
});

const render = (child: React.ReactElement) =>
  renderToStaticMarkup(h(I18nextProvider, { i18n }, child));
const checkIdentity = (html: string, label: string) => {
  match(html, new RegExp(`>${label}<`));
  doesNotMatch(html, /(?:>|aria-label=")[^<"]*9q-opaque-account-id/);
  doesNotMatch(html, />9Q</);
};

describe("unnamed roster accounts", () => {
  it("uses translated copy for missing, blank, and whitespace-only identity fields", () => {
    for (const [locale, label] of locales) {
      const t = i18n.getFixedT(locale, "teams");
      const fallback = t("people.roster.unnamedAccount");
      strictEqual(fallback, label);
      for (const fields of [
        {},
        { displayName: "", email: "" },
        { displayName: "  ", email: " \t " },
      ]) {
        const person = { ...member, ...fields };
        strictEqual(rosterPersonName(person, fallback), label);
        strictEqual(personDisplayName(person, fallback), label);
        strictEqual(chartPerson(person, fallback).name, label);
        strictEqual(
          initialsFor(rosterPersonName(person, fallback)),
          locale === "en" ? "UA" : "CS",
        );
      }
      strictEqual(initialsFor(personDisplayName(member, "")), "?");
      strictEqual(
        rosterPersonName(
          {
            ...member,
            displayName: " Team Owner ",
            email: "owner@example.test",
          },
          fallback,
        ),
        "Team Owner",
      );
      strictEqual(
        rosterPersonName(
          { ...member, displayName: " ", email: " owner@example.test " },
          fallback,
        ),
        "owner@example.test",
      );
    }
  });

  it("uses the translated name in team and personal trees, the ledger, and share cards", () => {
    for (const [locale, label] of locales) {
      const unnamedAccount = i18n.getFixedT(
        locale,
        "teams",
      )("people.roster.unnamedAccount");
      for (const personal of [false, true]) {
        const input = {
          agents: [employee],
          members: [member],
          name: "Team",
          personal,
          unnamedAccount,
        };
        const screen = buildOrgTree(input, SCREEN_TREE_CAPS);
        strictEqual(
          screen.root.kind === "person"
            ? screen.root.person.name
            : screen.branches[0].person.name,
          label,
        );
        const share = buildOrgTree(input, shareCardCaps(1));
        const layout = shareCardLayout(share, {
          morePeople: String,
          moreAgents: String,
        });
        strictEqual(
          layout.boxes.find((box) => box.node.kind === "person")?.label,
          label,
        );
      }
      const [line] = buildLedger([employee], [member], {
        work: null,
        usage: null,
        scope: "org",
        unnamedAccount,
      });
      strictEqual(line.people?.manages[0].name, label);
    }
  });

  it("renders translated names and safe initials in People rows and both chart layouts", async () => {
    for (const [locale, label] of locales) {
      await i18n.changeLanguage(locale);
      checkIdentity(
        render(
          h(PeopleRosterRow, {
            member,
            isSelf: false,
            editable: true,
            focused: false,
            onRole: () => {},
            onRemove: () => {},
          }),
        ),
        label,
      );
      checkIdentity(
        render(
          h(AgentPersonRow, {
            row: {
              member,
              level: "manager",
              isSelf: false,
              isOwner: true,
              canBeManager: true,
            },
            onAction: () => {},
          }),
        ),
        label,
      );
      const tree = buildOrgTree(
        {
          agents: [employee],
          members: [member],
          name: "Team",
          personal: false,
          unnamedAccount: i18n.t("people.roster.unnamedAccount"),
        },
        SCREEN_TREE_CAPS,
      );
      for (const phone of [false, true]) {
        checkIdentity(
          render(
            h(OrgChartTreeView, {
              tree,
              phone,
              onOpenBoard: () => {},
              onOpenPerson: () => {},
              onShare: () => {},
            }),
          ),
          label,
        );
      }
    }
  });
});
