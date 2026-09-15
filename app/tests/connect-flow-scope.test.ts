import { deepStrictEqual, notStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  beginFlow,
  createRegistry,
  endFlow,
  flowPromise,
} from "../src/components/integrations/connect-flow-registry.ts";
import {
  connectFlowKey,
  connectFlowScope,
  scopedBySlug,
} from "../src/components/integrations/connect-flow-scope.ts";
import type { Waker } from "../src/components/integrations/model.ts";

const waker = (): Waker => ({ wake: () => {}, wait: async () => {} });

const account = connectFlowScope(undefined);
const agent = connectFlowScope("agent-7");

describe("connect flow scope", () => {
  it("gives the account scope a key of its own, never an agent's", () => {
    notStrictEqual(
      connectFlowKey(account, "slack"),
      connectFlowKey(agent, "slack"),
    );
    strictEqual(
      connectFlowKey(agent, "slack"),
      connectFlowKey(connectFlowScope("agent-7"), "slack"),
    );
  });

  it("lets an agent connect run beside the manager's account-scoped one", () => {
    // The manager connects Slack for the ACCOUNT (the gateway skips the agent
    // allowlist); an agent's chat card must start its OWN hand-off so its
    // allowlist is consulted, instead of joining a flow that never checks it.
    const reg = createRegistry();
    const managerEntry = beginFlow(
      reg,
      connectFlowKey(account, "slack"),
      waker(),
    );
    ok(managerEntry, "the manager claims the account-scoped flow");
    managerEntry.promise = Promise.resolve("active");

    strictEqual(
      flowPromise(reg, connectFlowKey(agent, "slack")),
      null,
      "the agent has nothing to join",
    );
    ok(
      beginFlow(reg, connectFlowKey(agent, "slack"), waker()),
      "so it starts its own agent-scoped flow",
    );
  });

  it("still single-flights two callers inside the SAME scope", () => {
    const reg = createRegistry();
    const first = beginFlow(reg, connectFlowKey(agent, "slack"), waker());
    ok(first);
    first.promise = Promise.resolve("active");
    strictEqual(beginFlow(reg, connectFlowKey(agent, "slack"), waker()), null);
    strictEqual(
      flowPromise(reg, connectFlowKey(agent, "slack")),
      first.promise,
    );
    endFlow(reg, connectFlowKey(agent, "slack"));
    strictEqual(flowPromise(reg, connectFlowKey(agent, "slack")), null);
  });

  it("projects a scope's keys back down to plain toolkit slugs", () => {
    const states = {
      [connectFlowKey(account, "slack")]: "waiting",
      [connectFlowKey(account, "notion")]: "starting",
      [connectFlowKey(agent, "slack")]: "polling",
    };
    deepStrictEqual(scopedBySlug(states, account), {
      slack: "waiting",
      notion: "starting",
    });
    deepStrictEqual(scopedBySlug(states, agent), { slack: "polling" });
    deepStrictEqual(scopedBySlug({}, agent), {});
  });
});
