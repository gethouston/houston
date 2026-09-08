import { expect, test, vi } from "vitest";
import { gatewayEntityDirectory } from "./entity-directory-gateway";

const gateway = { url: "https://gateway.test", token: "gateway-token" };
test("gateway directory reads every entity family with the acting identity", async () => {
  const bodies: Record<string, unknown> = {
    "/agents": [
      { id: "assistant", name: "Assistant" },
      { id: "dobby", name: "Dobby", workspaceId: "Houston" },
    ],
    "/v1/org/teams": [{ id: "t", name: "Sales" }],
    "/v1/workspaces": [{ id: "w", name: "Work" }],
    "/v1/org/people": [{ userId: "u", displayName: "Alice" }],
    "/v1/org/invites": [{ id: "i", email: "alice@example.test" }],
    "/agents/dobby/routines": { items: [{ id: "r", name: "Morning" }] },
    "/agents/dobby/skills": { items: [{ name: "s", title: "Search" }] },
    "/v1/workspaces/w/shared-skills": {
      items: [{ name: "ss", title: "Shared" }],
    },
    "/agents/dobby/activities": { items: [{ id: "a", title: "Research" }] },
  };
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer gateway-token",
    );
    expect(new Headers(init?.headers).get("x-houston-acting-as")).toBe(
      "acting",
    );
    return Response.json(bodies[new URL(String(url)).pathname]);
  });
  const directory = gatewayEntityDirectory({
    gateway,
    fetchImpl,
    actingAs: "acting",
    agentId: "assistant",
  });
  expect((await directory.agents()).map((a) => a.agent.id)).toEqual(["dobby"]);
  expect(await directory.teams()).toEqual([{ id: "t", name: "Sales" }]);
  expect(await directory.workspaces()).toEqual([{ id: "w", name: "Work" }]);
  expect(await directory.members()).toEqual([{ userId: "u", name: "Alice" }]);
  expect(await directory.invites()).toEqual([
    { id: "i", email: "alice@example.test" },
  ]);
  expect(await directory.routines("dobby")).toEqual([
    { id: "r", name: "Morning" },
  ]);
  expect(await directory.skills("dobby")).toEqual([
    { slug: "s", name: "Search" },
  ]);
  expect(await directory.sharedSkills("w")).toEqual([
    { slug: "ss", name: "Shared" },
  ]);
  expect(await directory.activities("dobby")).toEqual([
    { id: "a", name: "Research" },
  ]);
  expect(fetchImpl).toHaveBeenCalledTimes(9);
});

test.each([
  Response.json({}, { status: 503 }),
  Response.json({ wrong: [] }),
  Response.json([{ id: "broken" }]),
])("unreadable directory is never an empty list", async (response) => {
  const directory = gatewayEntityDirectory({
    gateway,
    agentId: "assistant",
    fetchImpl: async () => response,
  });
  await expect(directory.agents()).rejects.toThrow();
});
