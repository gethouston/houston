import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  assistantLanding,
  assistantLandingWorkspace,
  driveAssistantLanding,
} from "../src/lib/assistant-landing.ts";
import { settingsLanding } from "../src/lib/settings-landing.ts";

const personalSlug = "1111111111111111";
const teamSlug = "2222222222222222";
const personal = {
  id: "default",
  name: "Personal",
  isDefault: true,
  createdAt: "",
};
const team = {
  ...personal,
  id: `org:${teamSlug}`,
  name: "Team",
  isDefault: false,
};
const memberships = [
  { slug: personalSlug, kind: "personal" as const },
  { slug: teamSlug, kind: "team" as const },
];
const workspaces = [personal, team];

describe("assistant channel landing authorization", () => {
  it("accepts exactly one valid org slug and rejects ambiguous links", () => {
    deepStrictEqual(assistantLanding(`?assistant=${teamSlug}`), {
      kind: "assistant",
      slug: teamSlug,
    });
    deepStrictEqual(assistantLanding("?settings=channels"), { kind: "absent" });
    for (const search of [
      "?assistant=",
      "?assistant=default",
      "?assistant=https://evil.test",
      `?assistant=${teamSlug}&assistant=${personalSlug}`,
    ])
      deepStrictEqual(assistantLanding(search), { kind: "invalid" });
    deepStrictEqual(
      settingsLanding(`?settings=channels&assistant=${teamSlug}`),
      {
        kind: "absent",
      },
    );
  });
  it("maps personal and team memberships to their exact authorized workspace", () => {
    strictEqual(
      assistantLandingWorkspace(personalSlug, memberships, workspaces),
      personal,
    );
    strictEqual(
      assistantLandingWorkspace(teamSlug, memberships, workspaces),
      team,
    );
  });
  it("never falls back to the current personal workspace or accepts an invite", () => {
    strictEqual(assistantLandingWorkspace(teamSlug, [], workspaces), null);
    strictEqual(
      assistantLandingWorkspace(teamSlug, memberships, [personal]),
      null,
    );
    strictEqual(
      assistantLandingWorkspace("3333333333333333", memberships, workspaces),
      null,
    );
    strictEqual(
      assistantLandingWorkspace(personalSlug, memberships, [team]),
      null,
    );
  });
  it("selects the authorized space before opening its assistant", async () => {
    const calls: string[] = [];
    const result = await driveAssistantLanding(teamSlug, {
      load: async () => ({ memberships, workspaces }),
      current: () => true,
      select: async (workspace) => {
        calls.push(workspace.id);
        return true;
      },
      open: () => {
        calls.push("assistant");
      },
    });
    strictEqual(result, "opened");
    deepStrictEqual(calls, [team.id, "assistant"]);
  });
  it("does not navigate if membership is missing or identity changed while loading", async () => {
    for (const current of [true, false]) {
      let touched = false;
      const result = await driveAssistantLanding(teamSlug, {
        load: async () => ({ memberships: [], workspaces }),
        current: () => current,
        select: async () => {
          touched = true;
          return true;
        },
        open: () => {
          touched = true;
        },
      });
      strictEqual(result, current ? "unavailable" : "cancelled");
      strictEqual(touched, false);
    }
  });
  it("does not open a different assistant when the user switches during discovery", async () => {
    let opened = false;
    const result = await driveAssistantLanding(teamSlug, {
      load: async () => ({ memberships, workspaces }),
      current: () => true,
      select: async () => false,
      open: () => {
        opened = true;
      },
    });
    strictEqual(result, "cancelled");
    strictEqual(opened, false);
  });
});
