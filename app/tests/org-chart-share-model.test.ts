import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import i18next from "i18next";
import {
  isShareCancel,
  linkedInShareUrl,
  SHARE_CARD_CAPS,
  shareAbilities,
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
    { agents: [agent("a"), agent("b")], members, name, personal },
    SHARE_CARD_CAPS,
  );

describe("sharePostText", () => {
  it("names the company with its counts, Houston and gethouston.ai", () => {
    const text = sharePostText(i18n.getFixedT("en", "teams"), tree(false));
    ok(text.includes("Acme & Co"), text);
    ok(text.includes("2 people and 2 AI Employees"), text);
    ok(text.includes("Houston"), text);
    ok(text.includes("gethouston.ai"), text);
  });

  it("speaks in the first person for a personal space", () => {
    const text = sharePostText(i18n.getFixedT("en", "teams"), tree(true));
    ok(text.includes("me and 2 AI Employees"), text);
    ok(!text.includes("Acme"), text);
  });

  it("uses singular counts and every shipped language, with no em dash and at most two hashtags", () => {
    const one = buildOrgTree(
      {
        agents: [agent("a")],
        members: members.slice(0, 1),
        name: "Solo",
        personal: false,
      },
      SHARE_CARD_CAPS,
    );
    for (const lng of ["en", "es", "pt"]) {
      for (const subject of [one, tree(false), tree(true)]) {
        const text = sharePostText(i18n.getFixedT(lng, "teams"), subject);
        ok(!text.includes("—"), `${lng}: ${text}`);
        ok(!text.includes("{{"), `${lng}: ${text}`);
        ok((text.match(/#/g) ?? []).length <= 2, `${lng}: ${text}`);
        ok(text.includes("gethouston.ai"), `${lng}: ${text}`);
      }
    }
    ok(
      sharePostText(i18n.getFixedT("en", "teams"), one).includes(
        "1 person and 1 AI Employee",
      ),
    );
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

describe("shareAbilities", () => {
  const file = new File(["x"], "x.png", { type: "image/png" });
  const fn = () => undefined;

  it("offers copy image only with clipboard.write and ClipboardItem", () => {
    deepStrictEqual(shareAbilities({ clipboard: { write: fn } }, file), {
      copyImage: false,
      nativeShare: false,
    });
    strictEqual(
      shareAbilities({ clipboard: { write: fn }, ClipboardItem: fn }, file)
        .copyImage,
      true,
    );
  });

  it("offers the share sheet only when it takes this file", () => {
    strictEqual(
      shareAbilities({ share: fn, canShare: () => true }, file).nativeShare,
      true,
    );
    strictEqual(
      shareAbilities({ share: fn, canShare: () => false }, file).nativeShare,
      false,
    );
    strictEqual(
      shareAbilities({ share: fn, canShare: () => true }, null).nativeShare,
      false,
    );
    strictEqual(
      shareAbilities({ canShare: () => true }, file).nativeShare,
      false,
    );
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
