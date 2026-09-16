import type { AgentIR } from "@houston/agentstore-contract";
import { packAgent, storePackageFromIrPayload } from "@houston/domain";
import { HoustonClient } from "@houston/engine-adapter/client";
import { parkUpload, previewUpload } from "@houston/engine-adapter/portable";
import { agentColorId } from "@houston-ai/core";
import { afterEach, expect, test, vi } from "vitest";

/**
 * The import wizard's confirm step: installing a parked `.houstonagent` is an
 * ordinary agent CREATE carrying the selected content as its seed payload —
 * never a POST to the account-level /v1/portable routes, which the hosted
 * cloud's gateway does not serve (HOU-707). One request shape for both
 * backends: the local host writes the seeds on create; the gateway persists
 * them and seeds the new agent's pod.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// createAgent records the picked color in the localStorage overlay; the node
// test env has no storage, so give it an inert one.
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const NOW = "2026-07-06T00:00:00.000Z";
// Driven through the composed client: the create the install performs is the
// adapter's SDK-delegated `POST /agents`, which `portable.ts` takes as a
// parameter because it holds no SDK handle.
const install = (req: Parameters<HoustonClient["importInstall"]>[0]) =>
  new HoustonClient({
    baseUrl: "https://gateway.example",
    token: "tok",
    controlPlane: true,
  }).importInstall(req);

const ROUTINE = {
  id: "r1",
  name: "Daily",
  // Stray key from an older build's pack — HOU-725 removed `description`;
  // unpack normalizes imported routines, so it must not reach the seed.
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
      JSON.stringify({ id: "abcd1234abcd1234", name: "Sales", createdAt: 0 }),
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
  // The source agent's colour rides the WIRE: an install has no picker to seed
  // a client overlay from, so the host is what remembers it.
  expect(body.color).toBe(agentColorId("#ff0000"));
  expect(body.claudeMd).toContain("sales agent");
  expect(Object.keys(body.seeds ?? {}).sort()).toEqual([
    ".agents/skills/research/SKILL.md",
    ".houston/routines/routines.json",
  ]);
  // The unticked learning stays out of the payload entirely.
  expect(JSON.stringify(body)).not.toContain("Prefers brevity");
  // The seeded routine is the source's, under a NEW id: the hosted trigger
  // tables key on routine id globally, so a copy must never share one with
  // its source (PRODUCT-1808). The install reports which id became which.
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
    // The created record rides along so the wizard can adopt it into the
    // agent store optimistically — same reveal contract as create (HOU-710).
    agent: expect.objectContaining({
      id: "abcd1234abcd1234",
      folderPath: "abcd1234abcd1234",
      name: "Sales",
    }),
  });
});

/** A store listing carrying one routine of each wake kind. */
const STORE_IR: AgentIR = {
  irVersion: "2.0.0",
  identity: {
    slug: "inbox-helper",
    name: "Inbox Helper",
    description: "Sorts the morning mail.",
    category: "productivity",
    tags: [],
    creator: { displayName: "Avery Chen" },
  },
  instructions: "You are a calm inbox assistant.",
  skills: [],
  learnings: [],
  integrations: ["GMAIL"],
  routines: [
    {
      id: "morning-digest",
      name: "Morning digest",
      prompt: "Summarize what arrived overnight.",
      wake: { kind: "schedule", cron: "0 8 * * 1-5" },
    },
    {
      id: "new-mail-summary",
      name: "New mail summary",
      prompt: "Summarize each new email.",
      wake: {
        kind: "composio",
        toolkit: "gmail",
        triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
        triggerConfig: { labelIds: "INBOX" },
      },
    },
    {
      id: "external-ping",
      name: "External ping",
      prompt: "Report what called this.",
      wake: { kind: "webhook" },
    },
  ],
  provenance: { createdVia: "houston" },
};

test("a store listing's routines install under fresh ids with no minted key", async () => {
  const pkg = storePackageFromIrPayload({ ir: STORE_IR }, "1.0.0");
  if ("error" in pkg) throw new Error(pkg.error);
  const { packageId } = parkUpload({ manifest: pkg.manifest, ...pkg.content });
  const calls = stubFetch(
    new Response(
      JSON.stringify({ id: "beef1234beef1234", name: "Inbox", createdAt: 0 }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ),
  );

  const installed = await install({
    packageId,
    workspaceName: "Houston",
    agentName: "Inbox",
    selection: {
      includeClaudeMd: true,
      includeSkillSlugs: [],
      includeRoutineIds: [
        "morning-digest",
        "new-mail-summary",
        "external-ping",
      ],
      includeLearningIds: [],
    },
  });

  const body = JSON.parse(String(calls[0]?.init?.body)) as {
    seeds?: Record<string, string>;
  };
  const seeded = JSON.parse(
    body.seeds?.[".houston/routines/routines.json"] ?? "",
  ) as Array<{ id: string; name: string; trigger?: Record<string, unknown> }>;

  expect(seeded.map((r) => r.name)).toEqual([
    "Morning digest",
    "New mail summary",
    "External ping",
  ]);
  // The gateway's trigger tables key on routine id alone, so an install never
  // reuses the listing's ids (PRODUCT-1808).
  for (const r of seeded) {
    expect(STORE_IR.routines.map((x) => x.id)).not.toContain(r.id);
  }
  expect(Object.keys(installed.routineIds).sort()).toEqual([
    "external-ping",
    "morning-digest",
    "new-mail-summary",
  ]);
  // A listing can never hand over a webhook address: the installed routine
  // mints its own.
  expect(seeded[2]?.trigger).toEqual({ kind: "webhook" });
  expect(JSON.stringify(seeded)).not.toContain("key_prefix");
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
