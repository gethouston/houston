import { match, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const PICK_KEYS = [
  "subtitle",
  "empty",
  "createTrigger",
  "namePlaceholder",
  "nameLabel",
  "create",
  "creating",
  "failed",
] as const;
const SPACE = { en: /space/i, es: /espacio/i, pt: /espaço/i } as const;

describe("folder move destination picker copy", () => {
  it("speaks of spaces, not the share flow's teams", () => {
    const flow = source("components/team-view/team-move-flow.tsx");
    ok(!flow.includes("shareViaTeam.pick"), "reuses the share flow copy");
    match(flow, /const pickCopy = useMovePickCopy\(\);/);
    match(flow, /<PickStep\s+copy=\{pickCopy\}/);
    match(flow, /t\("moveTeam\.pick\.failed"\)/);
    const copy = source("components/agent/pick-step-copy.ts");
    const move = copy.slice(copy.indexOf("export function useMovePickCopy"));
    for (const key of PICK_KEYS.filter((k) => k !== "failed")) {
      match(move, new RegExp(`${key}: t\\("moveTeam\\.pick\\.${key}"\\)`));
    }
  });

  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} ships every moveTeam.pick string`, () => {
      const teams = JSON.parse(source(`locales/${locale}/teams.json`)) as {
        moveTeam?: { pick?: Record<string, unknown> };
      };
      const pick = teams.moveTeam?.pick ?? {};
      for (const key of PICK_KEYS) {
        strictEqual(
          typeof pick[key],
          "string",
          `${locale} moveTeam.pick.${key}`,
        );
        ok(!(pick[key] as string).includes("—"), `${key}: no em dashes`);
      }
      match(pick.subtitle as string, SPACE[locale]);
      match(pick.createTrigger as string, SPACE[locale]);
    });
  }
});
