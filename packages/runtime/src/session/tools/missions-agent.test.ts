import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { makeMissionTools } from "./missions";
import type { SandboxFetch } from "./sandbox-fetch";

const NOOP = {} as ExtensionToolContext;

interface Recorded {
  path: string;
  body: unknown;
}

const REPLY = {
  id: "m-1",
  title: "Roast the website",
  status: "done",
  missions: [],
};

const PROVIDERS: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-5.5", "gpt-5.5-codex"],
  },
  { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
];

function tools(
  personalAssistant: boolean,
  replyFor?: (path: string) => unknown,
) {
  const calls: Recorded[] = [];
  const call: SandboxFetch = async (path, init) => {
    calls.push({
      path,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(replyFor?.(path) ?? REPLY), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const [start, list, updateStatus] = makeMissionTools({
    call,
    personalAssistant,
    providers: PROVIDERS,
  });
  if (!start || !list || !updateStatus)
    throw new Error("missing mission tools");
  return {
    calls,
    started: (params: Parameters<typeof start.execute>[1]) =>
      start.execute("t", params, undefined, undefined, NOOP),
    startDescription: start.description,
    startSchema: start.parameters as unknown as {
      properties: Record<string, unknown>;
    },
    start: (params: Parameters<typeof start.execute>[1]) =>
      start.execute("t", params, undefined, undefined, NOOP),
    list: (params: Parameters<typeof list.execute>[1]) =>
      list.execute("t", params, undefined, undefined, NOOP),
    move: (params: Parameters<typeof updateStatus.execute>[1]) =>
      updateStatus.execute("t", params, undefined, undefined, NOOP),
  };
}

test("the assistant cannot start a mission without naming an agent", async () => {
  const { start, calls } = tools(true);
  const out = await start({ title: "Roast the website", prompt: "Roast it." });
  expect(out.details).toMatchObject({
    ok: false,
    error: { code: "agent_required" },
  });
  const first = out.content[0];
  expect(first?.type === "text" && first.text).toMatch(/agent/i);
  expect(calls.map((c) => c.path)).toEqual(["/sandbox/assistant/call"]);
});

test("the assistant's mission goes to the agent it names", async () => {
  const { start, calls } = tools(true);
  await start({
    agent: "Personal/Dobby",
    title: "Roast the website",
    prompt: "Roast it.",
  });
  expect(calls[0]?.path).toBe("/sandbox/missions/start");
  expect(calls[0]?.body).toMatchObject({
    agent: "Personal/Dobby",
    title: "Roast the website",
    prompt: "Roast it.",
  });
});

test("the assistant must name an agent to read or move a board too", async () => {
  const { list, move, calls } = tools(true);
  const refusals = [
    await list({}),
    await move({ id: "m-1", status: "done" }),
  ] as const;
  for (const out of refusals) {
    expect(out.details).toMatchObject({
      ok: false,
      error: { code: "agent_required" },
    });
    const first = out.content[0];
    expect(first?.type === "text" && first.text).toMatch(/agent/i);
  }
  expect(calls.map((c) => c.path)).toEqual([
    "/sandbox/assistant/call",
    "/sandbox/assistant/call",
  ]);

  await list({ agent: "Dobby" });
  expect(calls[2]?.path).toBe("/sandbox/missions?agent=Dobby");
  await move({ agent: "Dobby", id: "m-1", status: "done" });
  expect(calls[3]?.body).toMatchObject({ agent: "Dobby", id: "m-1" });
});

test("a refusal to read or move names the agents that would have worked", async () => {
  const agents = (path: string) =>
    path === "/sandbox/assistant/call"
      ? [
          { id: "a-1", name: "Dobby" },
          { id: "a-2", name: ".assistant" },
        ]
      : undefined;
  for (const out of [
    await tools(true, agents).list({}),
    await tools(true, agents).move({ id: "m-1", status: "done" }),
  ]) {
    const first = out.content[0];
    const text = first?.type === "text" ? first.text : "";
    expect(text).toContain("Dobby (id a-1)");
    expect(text).not.toContain(".assistant");
  }
});

test("every other agent keeps working on its own board, unchanged", async () => {
  const { start, list, move, calls } = tools(false);
  await start({ title: "Draft", prompt: "Write it." });
  expect(calls[0]?.path).toBe("/sandbox/missions/start");
  expect(calls[0]?.body).toEqual({ title: "Draft", prompt: "Write it." });

  await list({});
  expect(calls[1]?.path).toBe("/sandbox/missions");

  await move({ id: "m-1", status: "done" });
  expect(calls[2]?.body).toEqual({ id: "m-1", status: "done" });
});

test("a named agent works for any agent, not just the assistant", async () => {
  const { start, calls } = tools(false);
  await start({ agent: "Dobby", title: "Draft", prompt: "Write it." });
  expect(calls[0]?.body).toMatchObject({ agent: "Dobby" });
});

test("the assistant is told, in the tool itself, that an agent is required", () => {
  const assistant = tools(true);
  expect(assistant.startDescription).toContain("name the agent");
  expect(tools(false).startDescription).not.toBe(assistant.startDescription);
});

test("a friendly provider name reaches the host as the real id", async () => {
  const { start, calls } = tools(false);
  await start({ title: "Draft", prompt: "Write it.", provider: "codex" });
  expect(calls[0]?.body).toMatchObject({ provider: "openai-codex" });
});

test("an unknown provider never reaches the host, and names the options", async () => {
  const { start, calls } = tools(false);
  await expect(
    start({ title: "Draft", prompt: "Write it.", provider: "gemini-cli" }),
  ).resolves.toMatchObject({
    details: {
      ok: false,
      error: {
        code: "invalid_provider",
        message: expect.stringContaining(
          "openai-codex (ChatGPT / Codex (Plus / Pro))",
        ),
      },
    },
  });
  expect(calls).toEqual([]);
});

test("a disconnected provider is refused by name instead of failing later", async () => {
  const { start, calls } = tools(false);
  await expect(
    start({ title: "Draft", prompt: "Write it.", provider: "claude" }),
  ).resolves.toMatchObject({
    details: {
      ok: false,
      error: {
        code: "invalid_provider",
        message: expect.stringMatching(/anthropic .*is not connected/i),
      },
    },
  });
  expect(calls).toEqual([]);
});

test("the tool lists its connected providers, and only those", () => {
  const { startSchema } = tools(false);
  const provider = startSchema.properties.provider as
    | { anyOf?: { const?: string }[]; description?: string }
    | undefined;
  expect(provider?.anyOf?.map((b) => b.const)).toEqual(["openai-codex"]);
  expect(provider?.description).toContain(
    "openai-codex = ChatGPT / Codex (Plus / Pro)",
  );
  expect(provider?.description).not.toContain("anthropic");
});

test("the success message states the validated pin, never an unverified echo", async () => {
  const { started } = tools(false);
  const pinned = await started({
    title: "Draft",
    prompt: "Write it.",
    provider: "Codex",
    model: "gpt-5.5",
  });
  const text = pinned.content[0]?.type === "text" ? pinned.content[0].text : "";
  expect(text).toContain(
    "It runs on openai-codex (ChatGPT / Codex (Plus / Pro))",
  );
  expect(text).toContain("with model gpt-5.5");
  expect(pinned.details).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.5",
  });

  const plain = await started({ title: "Draft", prompt: "Write it." });
  const plainText =
    plain.content[0]?.type === "text" ? plain.content[0].text : "";
  expect(plainText).not.toContain("It runs on");
});
