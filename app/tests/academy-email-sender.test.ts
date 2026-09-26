import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  connectedEmailToolkit,
  EMAIL_TOOLKIT_SLUGS,
  emailSenderChoice,
} from "../src/lib/academy/email-lesson/email-sender.ts";
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
  const agents = [agent("ada"), agent("maya"), agent("leo")];

  it("defaults to the AI Employee whose screen is open", () => {
    const choice = emailSenderChoice({
      agents,
      activeAgentId: "maya",
      pickedAgentId: null,
    });
    strictEqual(choice.sender?.id, "maya");
    deepStrictEqual(
      choice.candidates.map((a) => a.id),
      ["ada", "maya", "leo"],
    );
  });

  it("falls back to the first in sidebar order when none is open", () => {
    const choice = emailSenderChoice({
      agents,
      activeAgentId: null,
      pickedAgentId: null,
    });
    strictEqual(choice.sender?.id, "ada");
  });

  it("keeps the user's pick over the open screen", () => {
    const choice = emailSenderChoice({
      agents,
      activeAgentId: "maya",
      pickedAgentId: "leo",
    });
    strictEqual(choice.sender?.id, "leo");
  });

  it("drops a pick that is no longer an AI Employee", () => {
    const choice = emailSenderChoice({
      agents,
      activeAgentId: null,
      pickedAgentId: "gone",
    });
    strictEqual(choice.sender?.id, "ada");
  });

  it("has nobody to send with an empty roster", () => {
    const choice = emailSenderChoice({
      agents: [],
      activeAgentId: null,
      pickedAgentId: null,
    });
    strictEqual(choice.sender, null);
    deepStrictEqual(choice.candidates, []);
  });
});
