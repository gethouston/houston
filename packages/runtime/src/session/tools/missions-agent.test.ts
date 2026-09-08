import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { makeMissionTools } from "./missions";
import type { SandboxFetch } from "./sandbox-fetch";

/**
 * WHERE an agent's mission tools act. Every agent works on its own board unless
 * it names another; the PERSONAL ASSISTANT must always name one — it keeps no
 * board of its own, so a mission it started for itself would sit somewhere the
 * user can never see (the incident this exists to make impossible).
 */

// The tools take their request scope from AsyncLocalStorage and never read the
// extension context, so an empty one is safe (same stance as the MCP bridge).
const NOOP = {} as ExtensionContext;

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

/** The runtime's provider status, as the tools see it when they are built. */
const PROVIDERS: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-5.5", "gpt-5.5-codex"],
  },
  { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
];

function tools(personalAssistant: boolean) {
  const calls: Recorded[] = [];
  const call: SandboxFetch = async (path, init) => {
    calls.push({
      path,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(REPLY), {
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
  await expect(
    start({ title: "Roast the website", prompt: "Roast it." }),
  ).rejects.toThrow(/agent/i);
  // Nothing reached the host: no board anywhere grew a hidden card.
  expect(calls).toEqual([]);
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
  await expect(list({})).rejects.toThrow(/agent/i);
  await expect(move({ id: "m-1", status: "done" })).rejects.toThrow(/agent/i);
  expect(calls).toEqual([]);

  await list({ agent: "Dobby" });
  expect(calls[0]?.path).toBe("/sandbox/missions?agent=Dobby");
  await move({ agent: "Dobby", id: "m-1", status: "done" });
  expect(calls[1]?.body).toMatchObject({ agent: "Dobby", id: "m-1" });
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

// --- the provider/model pin is chosen from a list, never guessed -----------

test("a friendly provider name reaches the host as the real id", async () => {
  const { start, calls } = tools(false);
  await start({ title: "Draft", prompt: "Write it.", provider: "codex" });
  expect(calls[0]?.body).toMatchObject({ provider: "openai-codex" });
});

test("an unknown provider never reaches the host, and names the options", async () => {
  const { start, calls } = tools(false);
  await expect(
    start({ title: "Draft", prompt: "Write it.", provider: "gemini-cli" }),
  ).rejects.toThrow("openai-codex (ChatGPT / Codex (Plus / Pro))");
  expect(calls).toEqual([]);
});

test("a disconnected provider is refused by name instead of failing later", async () => {
  const { start, calls } = tools(false);
  await expect(
    start({ title: "Draft", prompt: "Write it.", provider: "claude" }),
  ).rejects.toThrow(/anthropic .*is not connected/i);
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

  // Nothing pinned and nothing inherited: no claim at all.
  const plain = await started({ title: "Draft", prompt: "Write it." });
  const plainText =
    plain.content[0]?.type === "text" ? plain.content[0].text : "";
  expect(plainText).not.toContain("It runs on");
});
