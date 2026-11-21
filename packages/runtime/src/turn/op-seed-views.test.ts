import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { SeedOp } from "./op-grammar-seed";
import { executeSeedOp } from "./op-seed";
import type { OpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import {
  type AgentStore,
  agentStore,
  claimedTurn,
  holdFirstGet,
  type PodDocs,
  PREFIX,
  podDocs,
  podSkillsAnswer,
  skillNames,
  writeSkill,
} from "./turn-views.test-support";

const AGENT_OPS = "agent-ops";

async function republishingSeed(agent: AgentStore, docs: PodDocs) {
  const op = {
    workspaceId: "w1",
    agentId: "agent-1",
    gcsPrefix: PREFIX,
    hostToken: "host-token",
    claim: { id: "ops", bootId: "b", token: "t", heartbeatUrl: "https://x" },
    credential: null,
    triggersEnabled: false,
    op: { kind: "seed", name: "A", republish: true },
  } as OpRequest & { op: SeedOp };
  return executeSeedOp({
    deps: {
      poolStoreUrl: "https://store.example",
      fetchImpl: docs.fetchImpl,
      activityDocRetryDelaysMs: [],
    } as unknown as TurnServerDeps,
    op,
    turn: { ...op, conversationId: AGENT_OPS },
    store: agent.store,
    prefix: PREFIX,
    root: await mkdtemp(join(tmpdir(), "op-seed-views-")),
    fenced: async () => false,
    views: {
      providers: () => [],
      providerUsage: async () => [],
      dataDir: await mkdtemp(join(tmpdir(), "op-seed-views-data-")),
    },
  });
}

async function seedAroundTurn(
  change: (turn: Awaited<ReturnType<typeof claimedTurn>>) => Promise<void>,
) {
  const gate = holdFirstGet("skills", AGENT_OPS);
  const agent = await agentStore();
  const docs = podDocs(
    { skills: await podSkillsAnswer(agent) },
    { hold: gate.hold },
  );
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const seeded = republishingSeed(agent, docs);
    await gate.atGet;
    const turn = await claimedTurn(agent, docs);
    await change(turn);
    await turn.settle();
    gate.release();
    await seeded;
  } finally {
    warn.mockRestore();
  }
  return { agent, docs };
}

test("a seed that publishes after a turn keeps the turn's skill", async () => {
  const { agent, docs } = await seedAroundTurn((turn) =>
    writeSkill(turn.filesystem, "drafting", "Draft replies"),
  );

  expect(skillNames(docs)).toEqual(["drafting", "existing"]);
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
});

test("a seed that publishes after a turn never brings back the skill it deleted", async () => {
  const { agent, docs } = await seedAroundTurn((turn) =>
    rm(join(turn.filesystem.workspaceDir, ".agents", "skills", "existing"), {
      recursive: true,
    }),
  );

  expect(skillNames(docs)).toEqual([]);
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
});
