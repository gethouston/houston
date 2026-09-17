import { describe, expect, it } from "vitest";
import {
  customIntegrationScope,
  resolveCustomTransportAgent,
} from "./custom-scope";

describe("customIntegrationScope", () => {
  it("a host that predates the flag is a shared host", () => {
    expect(customIntegrationScope(null)).toBe("host");
    expect(customIntegrationScope({})).toBe("host");
  });

  it("reads the deployment's declared scope", () => {
    expect(customIntegrationScope({ customIntegrationScope: "agent" })).toBe(
      "agent",
    );
    expect(customIntegrationScope({ customIntegrationScope: "host" })).toBe(
      "host",
    );
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
    expect(
      choose(
        { setupAgentId: "a2", pickedAgentId: "a3", currentAgentId: "a2" },
        "host",
      ),
    ).toBe("a1");
  });

  it("per-agent: the open setup chat's agent beats a prior pick", () => {
    // The Continue-setup banner reopens the chat on whichever agent owns
    // the draft; the chat registers there, so the list must read there.
    expect(choose({ setupAgentId: "a2", pickedAgentId: "a3" })).toBe("a2");
  });

  it("per-agent: the user's pick beats the sidebar's current agent", () => {
    expect(choose({ pickedAgentId: "a3", currentAgentId: "a2" })).toBe("a3");
  });

  it("per-agent: nothing picked = the agent the user was just in", () => {
    expect(choose({ currentAgentId: "a2" })).toBe("a2");
  });

  it("per-agent: nothing at all = the first agent", () => {
    expect(choose({})).toBe("a1");
  });

  it("an id naming a vanished agent falls through like no choice", () => {
    // A deleted agent or a space switch leaves stale ids behind.
    expect(
      choose({
        setupAgentId: "gone",
        pickedAgentId: "stale",
        currentAgentId: "x",
      }),
    ).toBe("a1");
  });

  it("no agents yet = the top-level route (undefined)", () => {
    expect(choose({ pickedAgentId: "a1" }, "agent", [])).toBe(undefined);
  });
});
