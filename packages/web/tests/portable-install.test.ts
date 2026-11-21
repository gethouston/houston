import { packAgent } from "@houston/domain";
import { HoustonClient } from "@houston/engine-adapter/client";
import { previewUpload } from "@houston/engine-adapter/portable";
import { agentColorId } from "@houston-ai/core";
import { afterEach, expect, test, vi } from "vitest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const NOW = "2026-07-06T00:00:00.000Z";
const install = (req: Parameters<HoustonClient["importInstall"]>[0]) =>
  new HoustonClient({
    baseUrl: "https://gateway.example",
    token: "tok",
    controlPlane: true,
  }).importInstall(req);

const ROUTINE = {
  id: "r1",
  name: "Daily",
  description: "",
  prompt: "check the inbox",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared" as const,
  integrations: [],
  created_at: NOW,
  updated_at: NOW,
};

const { description: _stray, ...SEEDED_ROUTINE } = ROUTINE;

function archive() {
  return packAgent(
    {
      claudeMd: "# Role\nYou are the sales agent.",
      skills: [
        { slug: "research", body: "---\nname: research\n---\n\nDig in.\n" },
      ],
      routines: [ROUTINE],
      learnings: [{ id: "l1", text: "Prefers brevity.", created_at: NOW }],
    },
    { agentName: "Sales", houstonVersion: "0.5.0" },
    NOW,
  );
}

function stubFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

test("install creates the agent with the package as its seed payload", async () => {
  const { packageId } = previewUpload(archive());
  const calls = stubFetch(
    new Response(
      JSON.stringify({
        id: "abcd1234abcd1234",
        workspaceId: "Houston",
        name: "Sales",
        createdAt: 0,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ),
  );

  const installed = await install({
    packageId,
    workspaceName: "Houston",
    agentName: "Sales",
    agentColor: "#ff0000",
    selection: {
      includeClaudeMd: true,
      includeSkillSlugs: ["research"],
      includeRoutineIds: ["r1"],
      includeLearningIds: [],
    },
  });

  expect(calls).toHaveLength(1);
  const call = calls[0];
  expect(call?.url).toBe("https://gateway.example/agents");
  expect(call?.init?.method).toBe("POST");
  const body = JSON.parse(String(call?.init?.body)) as {
    name: string;
    color?: string;
    claudeMd?: string;
    seeds?: Record<string, string>;
  };
  expect(body.name).toBe("Sales");
  expect(body.color).toBe(agentColorId("#ff0000"));
  expect(body.claudeMd).toContain("sales agent");
  expect(Object.keys(body.seeds ?? {}).sort()).toEqual([
    ".agents/skills/research/SKILL.md",
    ".houston/routines/routines.json",
  ]);
  expect(JSON.stringify(body)).not.toContain("Prefers brevity");
  const seeded = JSON.parse(
    body.seeds?.[".houston/routines/routines.json"] ?? "",
  ) as { id: string }[];
  const copiedId = seeded[0]?.id ?? "";
  expect(copiedId).not.toBe("r1");
  expect(seeded).toEqual([{ ...SEEDED_ROUTINE, id: copiedId }]);

  expect(installed).toEqual({
    agentPath: "abcd1234abcd1234",
    agentName: "Sales",
    workspaceName: "Houston",
    requiredIntegrations: [],
    routineIds: { r1: copiedId },
    agent: expect.objectContaining({
      id: "abcd1234abcd1234",
      folderPath: "abcd1234abcd1234",
      name: "Sales",
    }),
  });
});

test("installing an evicted packageId fails loudly without a request", async () => {
  const calls = stubFetch();
  await expect(
    install({
      packageId: "gone",
      workspaceName: "Houston",
      agentName: "X",
      selection: {
        includeClaudeMd: false,
        includeSkillSlugs: [],
        includeRoutineIds: [],
        includeLearningIds: [],
      },
    }),
  ).rejects.toThrow(/no longer available/);
  expect(calls).toHaveLength(0);
});
