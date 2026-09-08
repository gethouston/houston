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
  for (const pin of [
    { provider: "bogus" },
    { provider: "codex", model: "bogus" },
  ]) {
    if (!start) throw new Error("missing start");
    const result = await start.execute(
      "t",
      { ...params, ...pin },
      undefined,
      undefined,
      context,
    );
    expect(result.details).toMatchObject({
      ok: false,
      error: { code: "invalid_provider" },
    });
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
