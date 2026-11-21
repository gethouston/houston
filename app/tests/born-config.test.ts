import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AgentInitialConfig } from "@houston/engine-adapter";
import { QueryClient } from "@tanstack/react-query";
import {
  firstDayPlacement,
  pendingFirstDayAgents,
} from "../src/components/first-day/first-day-model.ts";
import type { Config } from "../src/data/config.ts";
import {
  bornConfig,
  readAgentConfig,
  recordFirstDayStarted,
  seedBornConfig,
} from "../src/lib/agent-provisioning/born-config.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const PATH = "/w/nova";
const nova = { folderPath: PATH };

const HIRE: AgentInitialConfig = {
  provider: "openai",
  model: "gpt-5",
  firstDay: "pending",
  arrival: "created",
};

function readConfig(
  client: QueryClient,
  creating: boolean,
  engine: Config = {},
): Promise<Config> {
  return client.fetchQuery({
    queryKey: queryKeys.config(PATH),
    queryFn: ({ client: c, queryKey }) =>
      readAgentConfig({
        creating,
        cached: c.getQueryData<Config>(queryKey),
        read: async () => engine,
      }),
    staleTime: 0,
  });
}

function placementOf(client: QueryClient) {
  const config = client.getQueryData<Config>(queryKeys.config(PATH));
  return firstDayPlacement({
    pinnedAgent: nova,
    pending: pendingFirstDayAgents(
      [nova],
      () => config,
      () => true,
    ),
    pinnedTaskCount: 0,
  });
}

describe("seedBornConfig", () => {
  it("puts a fresh hire's first-day hero on its board at once", () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, HIRE);
    deepStrictEqual(placementOf(client), { kind: "hero", agent: nova });
  });

  it("records the brain the way the host stores it", () => {
    deepStrictEqual(bornConfig(HIRE), {
      provider: "openai-codex",
      model: "gpt-5",
      firstDay: "pending",
      arrival: "created",
    });
  });

  it("offers nothing for an install that recorded no pending first day", () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, { provider: "anthropic", model: "opus" });
    deepStrictEqual(placementOf(client), { kind: "none" });
  });

  it("seeds nothing when the create recorded no config", () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, undefined);
    seedBornConfig(client, PATH, {});
    strictEqual(client.getQueryData(queryKeys.config(PATH)), undefined);
    deepStrictEqual(placementOf(client), { kind: "none" });
  });

  it("is stale from the start, so the first real read replaces it", () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, HIRE);
    const query = client
      .getQueryCache()
      .find({ queryKey: queryKeys.config(PATH) });
    strictEqual(query?.isStaleByTime(30_000), true);
  });
});

describe("the config read while the agent is still being created", () => {
  it("keeps the seed instead of the empty placeholder", async () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, HIRE);
    await readConfig(client, true);
    deepStrictEqual(placementOf(client), { kind: "hero", agent: nova });
  });

  it("answers the empty config when nothing was seeded, as before", async () => {
    const client = new QueryClient();
    deepStrictEqual(await readConfig(client, true), {});
  });

  it("reads the engine's document once the reads open", async () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, HIRE);
    const real = { ...bornConfig(HIRE), effort: "high" as const };
    deepStrictEqual(await readConfig(client, false, real), real);
  });
});

describe("after the first day starts", () => {
  it("takes the offer away, and a mid-warm-up refetch does not bring it back", async () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, HIRE);
    recordFirstDayStarted(client, PATH);
    deepStrictEqual(placementOf(client), { kind: "none" });
    await readConfig(client, true);
    deepStrictEqual(placementOf(client), { kind: "none" });
  });

  it("flips away when the engine's config says it started, whoever started it", async () => {
    const client = new QueryClient();
    seedBornConfig(client, PATH, HIRE);
    await readConfig(client, false, { firstDay: "started" });
    deepStrictEqual(placementOf(client), { kind: "none" });
  });
});
