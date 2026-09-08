import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import { expect, test, vi } from "vitest";
import { makeMissionTools } from "./missions";
import type { SandboxFetch } from "./sandbox-fetch";

/**
 * A provider connected (or disconnected) AFTER the session's tool defs were
 * built. The defs are cached for the session, so the schema's enum is a
 * construction-time hint; every refusal, every accepted pin and every "it runs
 * on X" sentence comes from the provider list resolved when the tool RUNS, in
 * the acting member's own scope.
 */

// The tools take their request scope from AsyncLocalStorage and never read the
// extension context, so an empty one is safe (same stance as the MCP bridge).
const NOOP = {} as ExtensionContext;

const { live } = vi.hoisted(() => ({
  live: { options: [] as ProviderOption[] },
}));
vi.mock("../../ai/provider-choices", () => ({
  connectedProviderChoices: () => live.options,
}));

const CODEX: ProviderOption = {
  id: "openai-codex",
  name: "ChatGPT / Codex (Plus / Pro)",
  connected: true,
  models: ["gpt-5.5", "gpt-5.5-codex"],
};

const ANTHROPIC: ProviderOption = {
  id: "anthropic",
  name: "Claude (Pro / Max)",
  connected: true,
  models: ["claude-opus-4-6", "claude-sonnet-5"],
};

const off = (o: ProviderOption): ProviderOption => ({
  ...o,
  connected: false,
});

interface Started {
  content: { type: string; text?: string }[];
  details: unknown;
}

/**
 * The tools as a session holds them: `built` is the status frozen into the
 * schema, and `set` moves the LIVE status the way the user does in the app
 * while the session is open.
 */
function session(built: readonly ProviderOption[]) {
  const bodies: unknown[] = [];
  let current: readonly ProviderOption[] = built;
  const call: SandboxFetch = async (_path, init) => {
    bodies.push(
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    );
    return new Response(JSON.stringify({ id: "m-1", title: "Draft" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const [start] = makeMissionTools({
    call,
    personalAssistant: false,
    providers: built,
    resolveProviders: () => current,
  });
  if (!start) throw new Error("missing start_mission");
  return {
    bodies,
    set: (options: readonly ProviderOption[]) => {
      current = options;
    },
    schema: start.parameters as unknown as {
      properties: Record<string, { anyOf?: { const?: string }[] }>;
    },
    start: (params: Parameters<typeof start.execute>[1]) =>
      start.execute(
        "t",
        params,
        undefined,
        undefined,
        NOOP,
      ) as Promise<Started>,
  };
}

const textOf = (r: Started): string =>
  r.content[0]?.type === "text" ? (r.content[0].text ?? "") : "";

test("a provider connected after the tools were built accepts its pin", async () => {
  const s = session([CODEX, off(ANTHROPIC)]);
  s.set([CODEX, ANTHROPIC]);
  const r = await s.start({
    title: "Draft",
    prompt: "Write it.",
    provider: "anthropic",
    model: "Sonnet 5",
  });
  expect(s.bodies[0]).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-5",
  });
  expect(r.details).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-5",
  });
});

test("the run-on sentence names a provider known only since the build", async () => {
  const s = session([CODEX, off(ANTHROPIC)]);
  s.set([CODEX, ANTHROPIC]);
  const text = textOf(
    await s.start({
      title: "Draft",
      prompt: "Write it.",
      provider: "anthropic",
      model: "claude-sonnet-5",
    }),
  );
  expect(text).toContain("It runs on anthropic (Claude (Pro / Max))");
  expect(text).toContain("claude-sonnet-5 (Sonnet 5)");
});

test("a refusal lists the values accepted right now, not at build time", async () => {
  const s = session([CODEX, off(ANTHROPIC)]);
  s.set([CODEX, ANTHROPIC]);
  await expect(
    s.start({ title: "Draft", prompt: "Write it.", provider: "gemini-cli" }),
  ).resolves.toMatchObject({
    details: {
      ok: false,
      error: {
        code: "invalid_provider",
        message: expect.stringMatching(/anthropic \(Claude \(Pro \/ Max\)\)/),
      },
    },
  });
  // Refused before the host: no board grew a card for a pin nothing matches.
  expect(s.bodies).toEqual([]);
});

test("a provider disconnected after the build is refused by name", async () => {
  const s = session([CODEX, ANTHROPIC]);
  s.set([CODEX, off(ANTHROPIC)]);
  await expect(
    s.start({ title: "Draft", prompt: "Write it.", provider: "claude" }),
  ).resolves.toMatchObject({
    details: {
      ok: false,
      error: {
        code: "invalid_provider",
        message: expect.stringMatching(/anthropic .*is not connected/i),
      },
    },
  });
  expect(s.bodies).toEqual([]);
});

test("a model is validated against the provider's live catalog", async () => {
  const s = session([CODEX, off(ANTHROPIC)]);
  s.set([CODEX, ANTHROPIC]);
  await expect(
    s.start({
      title: "Draft",
      prompt: "Write it.",
      provider: "anthropic",
      model: "gpt-5.5",
    }),
  ).resolves.toMatchObject({
    details: {
      ok: false,
      error: {
        code: "invalid_provider",
        message: expect.stringMatching(/claude-sonnet-5/),
      },
    },
  });
  expect(s.bodies).toEqual([]);
});

test("the schema keeps offering the set the session was built with", async () => {
  const s = session([CODEX, off(ANTHROPIC)]);
  s.set([CODEX, ANTHROPIC]);
  await s.start({ title: "Draft", prompt: "Write it.", provider: "anthropic" });
  expect(s.schema.properties.provider?.anyOf?.map((b) => b.const)).toEqual([
    "openai-codex",
  ]);
});

test("with no list injected, the live one is the runtime's own status", async () => {
  live.options = [CODEX, off(ANTHROPIC)];
  const bodies: unknown[] = [];
  const call: SandboxFetch = async (_path, init) => {
    bodies.push(
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    );
    return new Response(JSON.stringify({ id: "m-1", title: "Draft" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  // The production call site (conversation-cache.ts) passes exactly these two.
  const [start] = makeMissionTools({ call, personalAssistant: false });
  if (!start) throw new Error("missing start_mission");
  const run = (params: Parameters<typeof start.execute>[1]) =>
    start.execute("t", params, undefined, undefined, NOOP);

  await expect(
    run({ title: "Draft", prompt: "Write it.", provider: "claude" }),
  ).resolves.toMatchObject({
    details: {
      ok: false,
      error: {
        code: "invalid_provider",
        message: expect.stringMatching(/anthropic .*is not connected/i),
      },
    },
  });

  live.options = [CODEX, ANTHROPIC];
  await run({ title: "Draft", prompt: "Write it.", provider: "claude" });
  expect(bodies[0]).toMatchObject({ provider: "anthropic" });
});
