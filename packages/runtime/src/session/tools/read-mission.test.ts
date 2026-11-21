import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { makeReadMissionTool } from "./read-mission";
import type { SandboxFetch } from "./sandbox-fetch";

const NOOP = {} as ExtensionToolContext;

function tool(personalAssistant: boolean, transcript?: unknown) {
  const paths: string[] = [];
  const call: SandboxFetch = async (path) => {
    paths.push(path);
    if (path.includes("unknown-mission"))
      return Response.json(
        { code: "mission_not_found", error: "Mission not found" },
        { status: 404 },
      );
    return new Response(
      JSON.stringify(
        transcript ?? {
          id: "m-1",
          title: "Roast the website",
          totalMessages: 2,
          messages: [
            { role: "user", content: "Roast it" },
            { role: "assistant", content: "Here is the roast" },
          ],
        },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const read = makeReadMissionTool({ call, personalAssistant });
  return {
    paths,
    read: (params: Parameters<typeof read.execute>[1]) =>
      read.execute("t", params, undefined, undefined, NOOP),
  };
}

test("a named agent's mission is read through the host", async () => {
  const { read, paths } = tool(true);
  const result = await read({ agent: "Dobby", id: "m-1" });
  expect(paths[0]).toBe("/sandbox/missions/read?agent=Dobby&id=m-1&limit=20");
  const first = result.content[0];
  expect(first?.type === "text" && first.text).toContain("Here is the roast");
  expect(first?.type === "text" && first.text).toContain("Roast the website");
});

test("a quiet running mission tells the agent to check later", async () => {
  const { read } = tool(true, {
    id: "m-1",
    status: "running",
    title: "Quiet work",
    totalMessages: 0,
    messages: [],
  });
  const result = await read({ agent: "Dobby", id: "m-1" });
  const first = result.content[0];
  expect(first?.type === "text" && first.text).toContain(
    "This mission hasn't started talking yet (status: running). Check again later.",
  );
});

test("an own running mission with no conversation tells the agent to check later", async () => {
  const { read, paths } = tool(false, {
    id: "new-mission",
    status: "running",
    title: "Quiet work",
    totalMessages: 0,
    messages: [],
  });
  const result = await read({ id: "new-mission" });
  expect(result.details).toMatchObject({
    ok: true,
    id: "new-mission",
    totalMessages: 0,
  });
  const first = result.content[0];
  expect(first?.type === "text" && first.text).toContain("Check again later.");
  expect(paths).toEqual(["/sandbox/missions/read?id=new-mission&limit=20"]);
});

test("the assistant cannot read a mission without naming an agent", async () => {
  const { read, paths } = tool(true);
  const out = await read({ id: "m-1" });
  expect(out.details).toMatchObject({
    ok: false,
    error: { code: "agent_required" },
  });
  const first = out.content[0];
  expect(first?.type === "text" && first.text).toMatch(/agent/i);
  expect(paths.filter((p) => p.startsWith("/sandbox/missions"))).toEqual([]);
});

test("an unknown own mission checks the board before reporting not found", async () => {
  const { read, paths } = tool(false);
  const out = await read({ id: "unknown-mission" });
  expect(out.details).toMatchObject({
    ok: false,
    error: { code: "mission_not_found" },
  });
  expect(paths).toEqual(["/sandbox/missions/read?id=unknown-mission&limit=20"]);
});
