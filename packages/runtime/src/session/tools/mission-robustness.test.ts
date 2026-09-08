import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { makeMissionTools } from "./missions";

const context = {} as ExtensionContext;
const providers = [
  { id: "openai-codex", name: "Codex", connected: true, models: ["gpt-5.5"] },
];
const params = {
  title: "Draft",
  prompt: "Write it.",
  id: "m1",
  status: "done" as const,
};
for (const code of [
  "mission_cap",
  "mission_depth",
  "mission_fanout",
  "agent_not_found",
  "agent_ambiguous",
  "invalid_provider",
  "agent_unreachable",
  "agent_refused",
]) {
  test(`all mission executes return actionable ${code}`, async () => {
    const tools = makeMissionTools({
      personalAssistant: false,
      providers,
      call: async () =>
        Response.json(
          { code, error: "Choose another agent." },
          { status: 409 },
        ),
    });
    for (const tool of tools) {
      const result = await tool.execute(
        "t",
        params,
        undefined,
        undefined,
        context,
      );
      expect(result.details).toMatchObject({ ok: false, error: { code } });
      expect(result.content[0]).toEqual({
        type: "text",
        text: `ERROR ${code}: Choose another agent.`,
      });
    }
  });
}
test("unknown provider and model are values", async () => {
  const [start] = makeMissionTools({
    personalAssistant: false,
    providers,
    call: async () => {
      throw new Error("must not call host");
    },
  });
  if (!start) throw new Error("missing start");
  // A bad PROVIDER and a bad MODEL are different corrections, so they carry
  // different codes: re-pick a provider, or pick one of that provider's models.
  for (const { pin, code } of [
    { pin: { provider: "bogus" }, code: "invalid_provider" },
    { pin: { provider: "codex", model: "bogus" }, code: "invalid_model" },
  ]) {
    if (!start) throw new Error("missing start");
    const result = await start.execute(
      "t",
      { ...params, ...pin },
      undefined,
      undefined,
      context,
    );
    expect(result.details).toMatchObject({ ok: false, error: { code } });
  }
});
test("start reports the effective response pin", async () => {
  const [start] = makeMissionTools({
    personalAssistant: false,
    providers,
    call: async () =>
      Response.json(
        {
          id: "m1",
          title: "Draft",
          provider: "anthropic",
          model: "claude-sonnet-5",
        },
        { status: 201 },
      ),
  });
  if (!start) throw new Error("missing start");
  const result = await start.execute(
    "t",
    { ...params, provider: "codex", model: "gpt-5.5" },
    undefined,
    undefined,
    context,
  );
  expect(result.details).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-5",
  });
  expect(result.content[0]).toMatchObject({
    text: expect.stringContaining(
      "It runs on anthropic with model claude-sonnet-5",
    ),
  });
});

test("a 200 that is not a board is refused, never thrown", async () => {
  // `{"missions": null}` used to reach `.length` and throw a TypeError, which
  // pi surfaces as an opaque crashed turn - the one failure shape these tools
  // exist to avoid.
  const tools = makeMissionTools({
    personalAssistant: false,
    providers,
    call: async () => Response.json({ missions: null }, { status: 200 }),
  });
  const list = tools.find((t) => t.name === "list_missions");
  if (!list) throw new Error("missing list_missions");
  const result = await list.execute("t", {}, undefined, undefined, context);
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "host_error" },
  });
});

test("the host's turn-gate refusals reach the model with their own codes", async () => {
  // /sandbox/missions answers 400 not_in_turn / 403 plan_mode. Flattened to
  // `host_error` these read as "the server refused" - something to retry - when
  // the correction is to act inside a turn, or to wait for the user to leave
  // plan mode.
  for (const [status, code] of [
    [400, "not_in_turn"],
    [403, "plan_mode"],
  ] as const) {
    const tools = makeMissionTools({
      personalAssistant: false,
      providers,
      call: async () => Response.json({ code, error: "refused" }, { status }),
    });
    const list = tools.find((t) => t.name === "list_missions");
    if (!list) throw new Error("missing list_missions");
    const result = await list.execute("t", {}, undefined, undefined, context);
    expect(result.details).toMatchObject({ ok: false, error: { code } });
  }
});
