import { docKey } from "@houston/domain";
import { expect, test } from "vitest";
import { createTurnSandbox } from "./turn-sandbox-startup";
import {
  agentStore,
  claimedTurn,
  PREFIX,
  podDocs,
  routine,
  seed,
  storedRoutines,
  WORKSPACE_REL,
} from "./turn-views.test-support";
import type { TurnRequest } from "./types";

const daily = { name: "Daily", prompt: "Summarize", schedule: "0 9 * * *" };
const configured = {
  provider: "anthropic",
  model: "claude-opus-5-5",
  effort: "high",
};

async function fixture(
  pin: Partial<
    Pick<TurnRequest, "provider" | "model" | "effort" | "credential">
  > = {},
  routines?: unknown[],
) {
  const agent = await agentStore(routines);
  await seed(
    agent.prefixRoot,
    docKey(WORKSPACE_REL, "config"),
    JSON.stringify(configured),
  );
  const { filesystem } = await claimedTurn(agent, podDocs());
  const sandbox = createTurnSandbox({
    deps: { store: agent.store, token: "" },
    turn: {
      workspaceId: "W",
      agentId: "agent-1",
      conversationId: "c1",
      text: "Create a routine",
      gcsPrefix: PREFIX,
      credential: null,
      hostToken: "host-token",
      grant: {
        url: "https://gateway.test",
        token: "grant-token",
        expires: 4102444800,
        scopes: ["agent-writes"],
      },
      ...pin,
    },
    identity: { org: "w1", agent: "agent-1" },
    resolved: { store: agent.store, prefix: PREFIX },
    filesystem,
  });
  if (!sandbox) throw new Error("turn sandbox was not created");
  const save = (body: Record<string, unknown>) =>
    sandbox.call("/sandbox/routines/save", {
      method: "POST",
      body: JSON.stringify(body),
    });
  return { agent, sandbox, save };
}

test("a pooled turn following the configured agent uses Sonnet for new routines", async () => {
  const { agent, sandbox, save } = await fixture();
  try {
    const response = await save(daily);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      effort: "high",
    });
    expect(await storedRoutines(agent)).toMatchObject([
      { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" },
    ]);
  } finally {
    await sandbox.dispose();
  }
});

test.each([
  [undefined, "gpt-6.1-terra"],
  ["gpt-6-astra", "gpt-6-astra"],
])("a legacy Codex credential overrides the Anthropic config with explicit model %s", async (model, expectedModel) => {
  const { agent, sandbox, save } = await fixture({
    credential: {
      provider: "openai-codex",
      access: "test-access",
      expires: 4102444800,
      accountId: null,
      kind: "oauth",
    },
    model: "gpt-6-astra",
    effort: "max",
  });
  try {
    const response = await save({ ...daily, ...(model ? { model } : {}) });
    expect(response.status).toBe(201);
    expect(await storedRoutines(agent)).toMatchObject([
      { provider: "openai-codex", model: expectedModel, effort: "max" },
    ]);
  } finally {
    await sandbox.dispose();
  }
});

test.each([
  ["high", "low"],
  ["xhigh", "max"],
])("a pooled Codex turn overrides the configured provider and maps %s effort to %s", async (effort, expectedEffort) => {
  const { agent, sandbox, save } = await fixture({
    provider: "openai-codex",
    model: "gpt-6-astra",
    effort,
  });
  try {
    const response = await save(daily);
    expect(response.status).toBe(201);
    expect(await storedRoutines(agent)).toMatchObject([
      {
        provider: "openai-codex",
        model: "gpt-6.1-terra",
        effort: expectedEffort,
      },
    ]);
  } finally {
    await sandbox.dispose();
  }
});

test.each([
  [{}, "claude-opus-5-5", "anthropic", "high"],
  [
    { provider: "openai-codex", model: "gpt-6.1-terra", effort: "max" },
    "gpt-6-astra",
    "openai-codex",
    "max",
  ],
])("an explicit model survives pooled routine creation with pin %j", async (pin, model, provider, effort) => {
  const { agent, sandbox, save } = await fixture(pin);
  try {
    const response = await save({ ...daily, model });
    expect(response.status).toBe(201);
    expect(await storedRoutines(agent)).toMatchObject([
      { provider, model, effort },
    ]);
  } finally {
    await sandbox.dispose();
  }
});

test("pooled updates keep saved pins and routines that follow the agent", async () => {
  const originals = [
    { ...routine("r1", "Pinned"), ...configured },
    routine("r2", "Unpinned"),
  ];
  const { agent, sandbox, save } = await fixture(
    { provider: "openai-codex", model: "gpt-6-astra", effort: "max" },
    originals,
  );
  try {
    for (const original of originals) {
      expect(
        (await save({ id: original.id, prompt: "Only unread" })).status,
      ).toBe(200);
    }
    expect(await storedRoutines(agent)).toMatchObject(
      originals.map(({ provider, model, effort }) => ({
        provider,
        model,
        effort,
        prompt: "Only unread",
      })),
    );
  } finally {
    await sandbox.dispose();
  }
});
