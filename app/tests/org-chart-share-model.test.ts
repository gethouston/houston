import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston/engine-adapter";
import i18next from "i18next";
import {
  isShareCancel,
  linkedInShareUrl,
  SHARE_CARD_CAPS,
  SHARE_TEAM_COLUMNS,
  shareAltText,
  shareCardCaps,
  shareFileName,
  sharePostText,
  shareTitle,
} from "../src/components/organization/org-chart-share-model.ts";
import { buildOrgTree } from "../src/components/organization/org-chart-tree.ts";
import enTeams from "../src/locales/en/teams.json" with { type: "json" };
import esTeams from "../src/locales/es/teams.json" with { type: "json" };
import ptTeams from "../src/locales/pt/teams.json" with { type: "json" };

const i18n = i18next.createInstance();

before(async () => {
  await i18n.init({
    lng: "en",
    ns: ["teams"],
    defaultNS: "teams",
    interpolation: { escapeValue: false },
    resources: {
      en: { teams: enTeams },
      es: { teams: esTeams },
      pt: { teams: ptTeams },
    },
  });
});

const members: OrgMember[] = [
  { userId: "o", role: "owner", displayName: "Olga Owner" },
  { userId: "u", role: "user", displayName: "Uma User" },
];
const agent = (id: string) => ({
  id,
  name: id,
  folderPath: id,
  configId: "c",
  createdAt: "2026-01-01",
});
const tree = (personal: boolean, name = "Acme & Co") =>
  buildOrgTree(
    {
      unnamedAccount: "Unnamed account",
      agents: [agent("a"), agent("b")],
      members,
      name,
      personal,
    },
    SHARE_CARD_CAPS,
  );

describe("sharePostText", () => {
  const en = () => i18n.getFixedT("en", "teams");

  it("says it is the company's AI Employees, in Houston, ending on gethouston.ai", () => {
    strictEqual(
      sharePostText(en(), tree(false)),
      "This is my organization. These are all the AI Employees at Acme & Co, working in Houston.\n\ngethouston.ai",
    );
  });

  it("speaks of the person's own AI Employees in a personal space", () => {
    strictEqual(
      sharePostText(en(), tree(true)),
      "These are all my AI Employees, working in Houston.\n\ngethouston.ai",
    );
  });

  it("ships every language with no em dash, no hashtag, no link, and the site last", () => {
    for (const lng of ["en", "es", "pt"]) {
      for (const subject of [tree(false), tree(true)]) {
        const t = i18n.getFixedT(lng, "teams");
        const text = sharePostText(t, subject);
        ok(!text.includes("—"), `${lng}: ${text}`);
        ok(!text.includes("{{"), `${lng}: ${text}`);
        ok(!text.includes("#"), `${lng}: ${text}`);
        ok(!text.includes("http"), `${lng}: ${text}`);
        ok(text.includes("Houston"), `${lng}: ${text}`);
        ok(text.endsWith("gethouston.ai"), `${lng}: ${text}`);
        const alt = shareAltText(t, subject);
        ok(alt.includes(shareTitle(subject)) && !alt.includes("{{"), alt);
      }
      ok(
        sharePostText(i18n.getFixedT(lng, "teams"), tree(false)).includes(
          "Acme & Co",
        ),
        lng,
      );
    }
  });
});

describe("shareCardCaps", () => {
  const roster = (n: number): OrgMember[] => [
    { userId: "o", role: "owner", displayName: "Olga Owner" },
    ...Array.from({ length: n - 1 }, (_, i) => ({
      userId: `u${i}`,
      role: "user" as const,
      displayName: `User ${i}`,
    })),
  ];
  const agentOf = (id: string, userId: string): Agent => ({
    id,
    name: `Agent ${id}`,
    folderPath: id,
    configId: "c",
    createdAt: "2026-01-01",
    access: "manager",
    assignments: [{ userId, access: "user" }],
  });
  const team = (members: OrgMember[], agents: Agent[] = []) =>
    buildOrgTree(
      {
        unnamedAccount: "Unnamed account",
        agents,
        members,
        name: "Acme",
        personal: false,
      },
      shareCardCaps(members.length),
    );

  it("keeps four people whole", () => {
    const four = team(roster(4));
    strictEqual(four.branches.length, 4);
    strictEqual(four.morePeople, 0);
  });

  it("shows three and a +N from five people on, counting everyone", () => {
    for (const n of [5, 6, 12]) {
      const capped = team(roster(n));
      strictEqual(capped.branches.length, SHARE_TEAM_COLUMNS - 1, `${n}`);
      strictEqual(capped.morePeople, n - 3, `${n}`);
      strictEqual(capped.counts.people, n);
      strictEqual(capped.branches[0].person.userId, "o");
    }
  });

  it("never cuts someone with AI Employees for someone without", () => {
    // Owner, two people with none (first by name), then two with some: the
    // three that show are the owner and the two with AI Employees.
    const members: OrgMember[] = [
      { userId: "o", role: "owner", displayName: "Olga" },
      { userId: "a", role: "user", displayName: "Ann" },
      { userId: "b", role: "user", displayName: "Bob" },
      { userId: "c", role: "user", displayName: "Cy" },
      { userId: "d", role: "user", displayName: "Dee" },
    ];
    const capped = team(members, [agentOf("x", "c"), agentOf("y", "d")]);
    strictEqual(
      capped.branches.map((branch) => branch.person.userId).join(","),
      "o,c,d",
    );
    strictEqual(capped.morePeople, 2);
  });
});

describe("shareTitle", () => {
  it("is the space's name, or the personal space's person", () => {
    strictEqual(shareTitle(tree(false)), "Acme & Co");
    strictEqual(shareTitle(tree(true)), "Olga Owner");
  });
});

describe("shareFileName", () => {
  it("slugs the company into a safe PNG name", () => {
    strictEqual(shareFileName("Acme & Co."), "acme-co-org-chart.png");
    strictEqual(
      shareFileName("Café Niño / Ventas"),
      "cafe-nino-ventas-org-chart.png",
    );
    strictEqual(shareFileName("  ../../etc  "), "etc-org-chart.png");
    strictEqual(shareFileName("東京 Labs"), "東京-labs-org-chart.png");
  });

  it("falls back when nothing usable is left, and caps a long name", () => {
    strictEqual(shareFileName("***"), "org-chart.png");
    strictEqual(shareFileName(""), "org-chart.png");
    const long = shareFileName("a".repeat(59) + " b".repeat(40));
    ok(long.length <= 60 + "-org-chart.png".length, long);
    ok(!long.includes("--"), long);
  });
});

describe("linkedInShareUrl", () => {
  it("prefills LinkedIn's composer with the encoded post", () => {
    const url = new URL(linkedInShareUrl("Hi & bye\n#AI"));
    strictEqual(url.origin, "https://www.linkedin.com");
    strictEqual(url.searchParams.get("shareActive"), "true");
    strictEqual(url.searchParams.get("text"), "Hi & bye\n#AI");
  });
});

describe("isShareCancel", () => {
  it("treats only an AbortError as the person closing the sheet", () => {
    strictEqual(isShareCancel(new DOMException("x", "AbortError")), true);
    strictEqual(isShareCancel(new DOMException("x", "NotAllowedError")), false);
    strictEqual(isShareCancel(new Error("boom")), false);
    strictEqual(isShareCancel(null), false);
  });
});
