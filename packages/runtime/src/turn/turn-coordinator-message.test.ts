import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAsCoordinator } from "@houston/host/src/assistant/coordinator-scope";
import { ApprovalMessageRefusal } from "@houston/host/src/assistant/message-receipts";
import { afterEach, expect, test, vi } from "vitest";
import { openTurnApprovals } from "./turn-approvals";
import { bucket } from "./turn-approvals.test-support";
import { receiveTurnMessage } from "./turn-coordinator-message";
import type { TurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

const AGENT = "Personal/Assistant";
afterEach(() => vi.useRealTimers());

const message = (extra: Partial<TurnRequest> = {}): TurnRequest => ({
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "assistant",
  text: "make me a Researcher",
  nonce: "n1",
  gcsPrefix: "ws/acme/a551abc",
  credential: null,
  mode: "execute",
  actingAs: { userId: "owner-1" },
  actingToken: "acting-v1.x.y",
  coordinator: { token: "assistant-turn-v1.x.y", expires: 4102444800 },
  grants: ["createAgent"],
  turnId: "t1",
  ...extra,
});

async function receive(
  store: ReturnType<typeof bucket>["store"],
  turn: TurnRequest,
) {
  const root = await mkdtemp(join(tmpdir(), "coordinator-message-"));
  const filesystem = {
    storeRoot: root,
    dataRel: "workspaces/Personal/Assistant/.houston/runtime",
    manifest: new Map(),
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
  return runAsCoordinator(
    {
      userId: "owner-1",
      agentSlug: "a551abc",
      gateway: { url: "https://gateway.test", token: "t" },
    },
    () =>
      openTurnApprovals(
        {
          store,
          prefix: "ws/acme/a551abc",
          filesystem,
          agentId: AGENT,
          conversationId: "assistant",
        },
        (approvals, admitted, damaged) =>
          receiveTurnMessage(approvals, admitted, AGENT, turn, damaged),
      ),
  );
}

const spend = (opened: Awaited<ReturnType<typeof receive>>) =>
  opened.approvals.grants.spend({
    agentId: AGENT,
    conversationId: "assistant",
    operation: "createAgent",
    actor: "acting-v1.x.y",
  });

test("a message retried after its approvals expired mints no grant again", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z"), toFake: ["Date"] });
  const { store } = bucket();
  const first = await receive(store, message());
  expect(spend(first)).toBeDefined();
  await first.save();
  vi.setSystemTime(new Date("2026-10-01T12:30:00Z"));
  const retried = await receive(store, message({ turnId: "t2" }));
  expect(spend(retried)).toBeUndefined();
});

test("a nonce reused for other words is refused even after a day", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z"), toFake: ["Date"] });
  const { store } = bucket();
  await (await receive(store, message())).save();
  vi.setSystemTime(new Date("2026-10-02T13:00:00Z"));
  await expect(
    receive(store, message({ text: "delete everything", turnId: "t2" })),
  ).rejects.toBeInstanceOf(ApprovalMessageRefusal);
});

test("a new message still mints its grant", async () => {
  const { store } = bucket();
  await (await receive(store, message())).save();
  const next = await receive(store, message({ nonce: "n2", turnId: "t2" }));
  expect(spend(next)).toBeDefined();
});

test("a nonce spelled like an object key is remembered like any other", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z"), toFake: ["Date"] });
  const { store } = bucket();
  const first = await receive(store, message({ nonce: "__proto__" }));
  expect(spend(first)).toBeDefined();
  await first.save();
  vi.setSystemTime(new Date("2026-10-01T12:30:00Z"));
  const retried = await receive(
    store,
    message({ nonce: "__proto__", turnId: "t2" }),
  );
  expect(spend(retried)).toBeUndefined();
});

test("an empty nonce is refused, as a host refuses it", async () => {
  const { store } = bucket();
  await expect(receive(store, message({ nonce: "" }))).rejects.toBeInstanceOf(
    ApprovalMessageRefusal,
  );
});

test("a damaged record admits the message but mints no grant from it", async () => {
  const { store, objects } = bucket();
  await (await receive(store, message())).save();
  for (const [key, value] of objects)
    if (key.endsWith("assistant-approvals.json"))
      objects.set(key, { ...value, body: "{damaged" });
  const retried = await receive(store, message({ turnId: "t2" }));
  expect(spend(retried)).toBeUndefined();
  const next = await receive(store, message({ nonce: "n2", turnId: "t3" }));
  expect(spend(next)).toBeDefined();
});
