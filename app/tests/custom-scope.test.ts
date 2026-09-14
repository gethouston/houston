import { equal } from "node:assert";
import { describe, it } from "node:test";
import {
  customIntegrationScope,
  resolveCustomTransportAgent,
} from "../src/components/integrations/custom-scope.ts";

describe("customIntegrationScope", () => {
  it("a host that predates the flag is a shared host", () => {
    equal(customIntegrationScope(null), "host");
    equal(customIntegrationScope({}), "host");
  });

  it("reads the deployment's declared scope", () => {
    equal(customIntegrationScope({ customIntegrationScope: "agent" }), "agent");
    equal(customIntegrationScope({ customIntegrationScope: "host" }), "host");
  });
});

describe("resolveCustomTransportAgent (PRODUCT-1773)", () => {
  const agentIds = ["a1", "a2", "a3"];
  const choose = (
    over: Partial<
      Pick<
        Parameters<typeof resolveCustomTransportAgent>[0],
        "setupAgentId" | "pickedAgentId" | "currentAgentId"
      >
    >,
    scope: "host" | "agent" = "agent",
    ids: readonly string[] = agentIds,
  ) =>
    resolveCustomTransportAgent({
      scope,
      agentIds: ids,
      setupAgentId: null,
      pickedAgentId: null,
      currentAgentId: null,
      ...over,
    });

  it("a shared host rides the first agent whatever was chosen", () => {
    equal(
      choose(
        { setupAgentId: "a2", pickedAgentId: "a3", currentAgentId: "a2" },
        "host",
      ),
      "a1",
    );
  });

  it("per-agent: the open setup chat's agent beats a prior pick", () => {
    // The Continue-setup banner reopens the chat on whichever agent owns
    // the draft; the chat registers there, so the list must read there.
    equal(choose({ setupAgentId: "a2", pickedAgentId: "a3" }), "a2");
  });

  it("per-agent: the user's pick beats the sidebar's current agent", () => {
    equal(choose({ pickedAgentId: "a3", currentAgentId: "a2" }), "a3");
  });

  it("per-agent: nothing picked = the agent the user was just in", () => {
    equal(choose({ currentAgentId: "a2" }), "a2");
  });

  it("per-agent: nothing at all = the first agent", () => {
    equal(choose({}), "a1");
  });

  it("an id naming a vanished agent falls through like no choice", () => {
    // A deleted agent or a space switch leaves stale ids behind.
    equal(
      choose({
        setupAgentId: "gone",
        pickedAgentId: "stale",
        currentAgentId: "x",
      }),
      "a1",
    );
  });

  it("no agents yet = the top-level route (undefined)", () => {
    equal(choose({ pickedAgentId: "a1" }, "agent", []), undefined);
  });
});
