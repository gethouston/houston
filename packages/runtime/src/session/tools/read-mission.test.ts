import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { makeReadMissionTool } from "./read-mission";
import type { SandboxFetch } from "./sandbox-fetch";

/**
 * Reviewing a mission that runs on ANOTHER agent. An agent's own missions live
 * in its runtime's transcript store and are read in-process; another agent's
 * live in another runtime, so those go through the host. The personal
 * assistant only ever reviews other agents' missions — it has none of its own.
 */

const NOOP = {} as ExtensionContext;

function tool(personalAssistant: boolean) {
  const paths: string[] = [];
  const call: SandboxFetch = async (path) => {
    paths.push(path);
    return new Response(
      JSON.stringify({
        id: "m-1",
        title: "Roast the website",
        totalMessages: 2,
        messages: [
          { role: "user", content: "Roast it" },
          { role: "assistant", content: "Here is the roast" },
        ],
      }),
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

test("the assistant cannot read a mission without naming an agent", async () => {
  const { read, paths } = tool(true);
  const out = await read({ id: "m-1" });
  expect(out.details).toMatchObject({
    ok: false,
    error: { code: "agent_required" },
  });
  const first = out.content[0];
  expect(first?.type === "text" && first.text).toMatch(/agent/i);
  // No mission was read: the only call made is the one that fetches the agents
  // the refusal offers instead.
  expect(paths.filter((p) => p.startsWith("/sandbox/missions"))).toEqual([]);
});

test("another agent reading its own mission never reaches the host", async () => {
  const { read, paths } = tool(false);
  // No such conversation in this runtime's store: the in-process path answers,
  // and the host is not consulted.
  const out = await read({ id: "unknown-mission" });
  expect(out.details).toMatchObject({
    ok: false,
    error: { code: "mission_not_found" },
  });
  expect(paths).toEqual([]);
});
