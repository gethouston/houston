import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  connectedEmailToolkit,
  EMAIL_TOOLKIT_SLUGS,
  emailSenderChoice,
} from "../src/lib/academy/email-lesson/email-sender.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

function agent(id: string): Agent {
  return {
    id,
    name: id,
    folderPath: `/ws/${id}`,
    configId: "blank",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function team(id: string, agents: Agent[]): TeamView {
  return { id, name: id, agents, isDefault: false };
}

describe("connectedEmailToolkit", () => {
  it("answers null with no email connected", () => {
    strictEqual(connectedEmailToolkit([]), null);
    strictEqual(
      connectedEmailToolkit([{ toolkit: "slack", status: "active" }]),
      null,
    );
  });

  it("ignores a connection that is not active yet", () => {
    strictEqual(
      connectedEmailToolkit([{ toolkit: "gmail", status: "initiated" }]),
      null,
    );
  });

  it("prefers Gmail over Outlook when both are connected", () => {
    const both = [
      { toolkit: "outlook", status: "active" },
      { toolkit: "gmail", status: "active" },
    ];
    deepStrictEqual(connectedEmailToolkit(both), {
      toolkit: "gmail",
      label: "Gmail",
    });
    deepStrictEqual(
      connectedEmailToolkit([{ toolkit: "outlook", status: "active" }]),
      { toolkit: "outlook", label: "Outlook" },
    );
  });

  it("recognises exactly the apps it can send through", () => {
    deepStrictEqual([...EMAIL_TOOLKIT_SLUGS], ["gmail", "outlook"]);
  });
});

describe("emailSenderChoice", () => {
  const sales = team("sales", [agent("maya"), agent("leo")]);
  const ops = team("ops", [agent("ada")]);

  it("defaults to the first AI Employee of the team the user last had open", () => {
    const choice = emailSenderChoice({
      teams: [ops, sales],
      activeTeamId: "sales",
      pickedAgentId: null,
    });
    strictEqual(choice.sender?.id, "maya");
    deepStrictEqual(
      choice.candidates.map((a) => a.id),
      ["maya", "leo"],
    );
  });

  it("falls back to the first team when none is open", () => {
    const choice = emailSenderChoice({
      teams: [ops, sales],
      activeTeamId: null,
      pickedAgentId: null,
    });
    strictEqual(choice.sender?.id, "ada");
  });

  it("keeps the user's pick while it is on the team", () => {
    const choice = emailSenderChoice({
      teams: [sales],
      activeTeamId: "sales",
      pickedAgentId: "leo",
    });
    strictEqual(choice.sender?.id, "leo");
  });

  it("drops a pick that is no longer on the team", () => {
    const choice = emailSenderChoice({
      teams: [sales],
      activeTeamId: "sales",
      pickedAgentId: "ada",
    });
    strictEqual(choice.sender?.id, "maya");
  });

  it("has nobody to send with an empty team, or no team at all", () => {
    for (const teams of [[team("empty", [])], []]) {
      const choice = emailSenderChoice({
        teams,
        activeTeamId: null,
        pickedAgentId: null,
      });
      strictEqual(choice.sender, null);
      deepStrictEqual(choice.candidates, []);
    }
  });
});
