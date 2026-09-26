import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import { createElement } from "react";
import {
  BootLandingContent,
  BootLandingPlaceholder,
} from "../src/components/shell/boot-landing-placeholder.tsx";
import {
  bootGuardStep,
  INITIAL_BOOT_GUARD,
} from "../src/components/shell/view-guard-rules.ts";
import { flatSidebarOrder } from "../src/lib/agent-order.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string) => ({ id, name: id }) as Agent;
const agents = [agent("a"), agent("b"), agent("c")];
const group = (id: string, agentIds: string[]) => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
});
const layout = (
  groups: SidebarLayout["groups"],
  order: SidebarLayout["order"],
): SidebarLayout => ({ groups, order });
const resolving = { kind: "resolving", workspaceId: "ws-1" } as const;
const base = {
  workspaceId: "ws-1",
  viewMode: "agents-home",
  agentsHomeAgentId: null,
  activeAgentId: null,
  isMobile: false,
  agentsReady: true,
  layoutReady: true,
};

function renderedLanding(landing: ReturnType<typeof bootGuardStep>["landing"]) {
  const home = createElement("div", { "data-screen": "agents-home" });
  return BootLandingContent({ landing, children: home });
}

describe("desktop boot landing", () => {
  it("renders the neutral content placeholder while the roster or layout resolves", () => {
    for (const readiness of [
      { agentsReady: false, layoutReady: true },
      { agentsReady: true, layoutReady: false },
    ]) {
      const step = bootGuardStep(INITIAL_BOOT_GUARD, {
        ...base,
        ...readiness,
        firstAgentId: "a",
      });
      assert.deepEqual(step.state, resolving);
      assert.deepEqual(step.landing, { kind: "resolving" });
      assert.equal(renderedLanding(step.landing).type, BootLandingPlaceholder);
    }
  });

  it("selects cached data on the first step without a resolving phase", () => {
    const step = bootGuardStep(INITIAL_BOOT_GUARD, {
      ...base,
      firstAgentId: "a",
    });
    assert.deepEqual(step.state, { kind: "done", workspaceId: "ws-1" });
    assert.deepEqual(step.action, { kind: "open-agent", agentId: "a" });
    assert.deepEqual(step.landing, { kind: "opening-agent", agentId: "a" });
    assert.equal(renderedLanding(step.landing).type, BootLandingPlaceholder);
  });

  it("opens the first employee in sidebar order after both reads settle", () => {
    const order = layout(
      [group("empty", []), group("work", ["b", "a"])],
      [
        { kind: "group", id: "empty" },
        { kind: "group", id: "work" },
        { kind: "agent", id: "c" },
      ],
    );
    const firstAgentId = flatSidebarOrder(agents, order)[0]?.id ?? null;
    assert.equal(firstAgentId, "b");
    const step = bootGuardStep(resolving, { ...base, firstAgentId });
    assert.deepEqual(step.action, { kind: "open-agent", agentId: "b" });
    assert.deepEqual(step.state, { kind: "done", workspaceId: "ws-1" });
  });

  it("opens an ungrouped employee when its root entry leads", () => {
    const order = layout(
      [group("work", ["b", "a"])],
      [
        { kind: "agent", id: "c" },
        { kind: "group", id: "work" },
      ],
    );
    const firstAgentId = flatSidebarOrder(agents, order)[0]?.id ?? null;
    assert.equal(firstAgentId, "c");
    assert.deepEqual(
      bootGuardStep(resolving, { ...base, firstAgentId }).action,
      { kind: "open-agent", agentId: "c" },
    );
  });

  it("shows the existing empty state as soon as the roster is empty", () => {
    const firstAgentId = flatSidebarOrder([], layout([], []))[0]?.id ?? null;
    const step = bootGuardStep(INITIAL_BOOT_GUARD, {
      ...base,
      layoutReady: false,
      firstAgentId,
    });
    assert.deepEqual(step.state, { kind: "done", workspaceId: "ws-1" });
    assert.deepEqual(step.landing, { kind: "done" });
    assert.equal(renderedLanding(step.landing).type, "div");
  });

  it("does not move someone who navigated while the reads were in flight", () => {
    const moved = bootGuardStep(resolving, {
      ...base,
      viewMode: "integrations-home",
      agentsReady: false,
      firstAgentId: null,
    });
    assert.deepEqual(moved.state, { kind: "done", workspaceId: "ws-1" });
    assert.deepEqual(
      bootGuardStep(moved.state, { ...base, firstAgentId: "a" }).action,
      { kind: "wait" },
    );
  });

  it("keeps the phone on the Agents tab root", () => {
    const step = bootGuardStep(INITIAL_BOOT_GUARD, {
      ...base,
      isMobile: true,
      agentsReady: false,
      layoutReady: false,
      firstAgentId: "a",
    });
    assert.deepEqual(step.action, { kind: "wait" });
    assert.deepEqual(step.landing, { kind: "done" });
    assert.equal(renderedLanding(step.landing).type, "div");
  });

  it("re-arms after a workspace switch without judging its outgoing view", () => {
    const switched = bootGuardStep(
      { kind: "done", workspaceId: "ws-1" },
      {
        ...base,
        workspaceId: "ws-2",
        viewMode: "agent",
        firstAgentId: "a",
      },
    );
    assert.deepEqual(switched.state, {
      kind: "resolving",
      workspaceId: "ws-2",
      outgoing: { viewMode: "agent", activeAgentId: null },
    });
    assert.deepEqual(switched.action, { kind: "wait" });
    assert.deepEqual(
      bootGuardStep(switched.state, {
        ...base,
        workspaceId: "ws-2",
        firstAgentId: "b",
      }).action,
      { kind: "open-agent", agentId: "b" },
    );
  });

  it("keeps the outgoing employee view through the new space reads", () => {
    const old = { kind: "done", workspaceId: "ws-1" } as const;
    const switched = bootGuardStep(old, {
      ...base,
      workspaceId: "ws-2",
      viewMode: "agent",
      agentsReady: false,
      layoutReady: false,
      firstAgentId: null,
    });
    const pending = bootGuardStep(switched.state, {
      ...base,
      workspaceId: "ws-2",
      viewMode: "agent",
      agentsReady: false,
      layoutReady: false,
      firstAgentId: null,
    });
    assert.deepEqual(pending.landing, { kind: "resolving" });
    const ready = bootGuardStep(pending.state, {
      ...base,
      workspaceId: "ws-2",
      viewMode: "agent",
      firstAgentId: "new-space-first",
    });
    assert.deepEqual(ready.action, {
      kind: "open-agent",
      agentId: "new-space-first",
    });
  });

  it("respects a new navigation made while the switched space loads", () => {
    const switched = bootGuardStep(
      { kind: "done", workspaceId: "ws-1" },
      {
        ...base,
        workspaceId: "ws-2",
        viewMode: "agent",
        agentsReady: false,
        firstAgentId: null,
      },
    );
    const navigated = bootGuardStep(switched.state, {
      ...base,
      workspaceId: "ws-2",
      viewMode: "academy",
      agentsReady: false,
      firstAgentId: null,
    });
    assert.deepEqual(navigated.landing, { kind: "done" });
    assert.deepEqual(navigated.action, { kind: "wait" });
  });

  it("respects a click on another employee made while the switched space loads", () => {
    const switched = bootGuardStep(
      { kind: "done", workspaceId: "ws-1" },
      {
        ...base,
        workspaceId: "ws-2",
        viewMode: "agent",
        activeAgentId: "old-space-agent",
        agentsReady: false,
        firstAgentId: null,
      },
    );
    const clicked = bootGuardStep(switched.state, {
      ...base,
      workspaceId: "ws-2",
      viewMode: "agent",
      activeAgentId: "picked",
      agentsReady: false,
      firstAgentId: null,
    });
    assert.deepEqual(clicked.landing, { kind: "done" });
    assert.deepEqual(
      bootGuardStep(clicked.state, {
        ...base,
        workspaceId: "ws-2",
        viewMode: "agent",
        activeAgentId: "picked",
        firstAgentId: "new-space-first",
      }).action,
      { kind: "wait" },
    );
  });

  it("keeps Agents home off the screen during a workspace switch", () => {
    const switched = bootGuardStep(
      { kind: "done", workspaceId: "ws-1" },
      { ...base, workspaceId: "ws-2", firstAgentId: "a" },
    );
    assert.deepEqual(switched.landing, { kind: "resolving" });
    assert.equal(
      renderedLanding(switched.landing).type,
      BootLandingPlaceholder,
    );
  });
});
