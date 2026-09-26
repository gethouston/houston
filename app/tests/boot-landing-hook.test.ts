import "./support/dom-env.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { BootGuardInput } from "../src/components/shell/view-guard-rules.ts";

const { act, createElement: h } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useBootLanding } = await import(
  "../src/components/shell/use-boot-landing.ts"
);

const opened: string[] = [];
const openAgent = (agentId: string) => opened.push(agentId);

function Harness({ input }: { input: BootGuardInput }) {
  const landing = useBootLanding(input, openAgent);
  return h("div", { "data-landing": landing.kind });
}

const host = document.createElement("div");
const root = createRoot(host);
const render = (input: BootGuardInput) =>
  act(() => root.render(h(Harness, { input })));
const landing = () =>
  host.querySelector("[data-landing]")?.getAttribute("data-landing");

const onAgent: BootGuardInput = {
  workspaceId: "ws-1",
  viewMode: "agent",
  agentsHomeAgentId: null,
  activeAgentId: "a",
  isMobile: false,
  agentsReady: true,
  layoutReady: true,
  firstAgentId: "a",
};

afterEach(() => {
  opened.length = 0;
});

describe("useBootLanding", () => {
  it("clears the placeholder after landing on the employee already open", async () => {
    await render(onAgent);
    assert.equal(landing(), "done");
    // "Move to another space": the space changes, the open employee and view
    // do not, so opening it changes nothing else that could re-render.
    await render({ ...onAgent, workspaceId: "ws-2" });
    assert.deepEqual(opened, ["a"]);
    assert.equal(landing(), "done");
  });

  it("opens the first employee once when a switched space settles", async () => {
    await render({ ...onAgent, workspaceId: "ws-3" });
    opened.length = 0;
    await render({
      ...onAgent,
      workspaceId: "ws-4",
      agentsReady: false,
      firstAgentId: null,
    });
    assert.equal(landing(), "resolving");
    await render({ ...onAgent, workspaceId: "ws-4", firstAgentId: "b" });
    await render({ ...onAgent, workspaceId: "ws-4", firstAgentId: "b" });
    assert.deepEqual(opened, ["b"]);
    assert.equal(landing(), "done");
  });
});
