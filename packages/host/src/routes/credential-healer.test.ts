import { expect, test } from "vitest";
import {
  type CredentialHeal,
  CredentialServeHealer,
} from "./credential-healer";

const HEAL_COOLDOWN_MS = 5 * 60_000;

function actingAs(sub: string): string {
  return `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;
}

/** A heal that records who asked and resolves when the test says so. */
function recorder(result = true) {
  const seen: (string | undefined)[] = [];
  const heal: CredentialHeal = async (args) => {
    seen.push(args.actingAs);
    return result;
  };
  return { seen, heal };
}

test("a member's heal is not coalesced into another member's in-flight attempt", async () => {
  // Both are the same (workspace, provider); only the acting identity differs.
  // Sharing the slot would answer member B with A's result — and, worse, capture
  // A's live credential onto B's row (HOU-976).
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen: (string | undefined)[] = [];
  const healer = new CredentialServeHealer(async ({ actingAs: who }) => {
    seen.push(who);
    await gate;
    return true;
  });

  const a = healer.attempt({
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "openai-codex",
    actingAs: actingAs("member-a"),
  });
  const b = healer.attempt({
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "openai-codex",
    actingAs: actingAs("member-b"),
  });
  release();
  expect(await Promise.all([a, b])).toEqual([true, true]);
  expect(seen).toEqual([actingAs("member-a"), actingAs("member-b")]);
});

test("the SAME member's concurrent misses still coalesce to one attempt", async () => {
  const { seen, heal } = recorder();
  const healer = new CredentialServeHealer(heal);
  const token = actingAs("member-a");
  const args = {
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "openai-codex",
    actingAs: token,
  };

  await Promise.all([healer.attempt(args), healer.attempt(args)]);

  expect(seen).toEqual([token]);
});

test("one member's cooldown never mutes another member's heal", async () => {
  const { seen, heal } = recorder();
  // A real epoch, not 0: the cooldown compares `now - (last ?? 0)`, so a clock
  // that starts at 0 reads a never-attempted key as one attempted this instant.
  let now = 1_700_000_000_000;
  const healer = new CredentialServeHealer(heal, () => now);
  const base = {
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "openai-codex",
  };

  await healer.attempt({ ...base, actingAs: actingAs("member-a") });
  now += 1_000;
  // Within A's cooldown window: A is refused, B is not.
  expect(
    await healer.attempt({ ...base, actingAs: actingAs("member-a") }),
  ).toBe(false);
  expect(
    await healer.attempt({ ...base, actingAs: actingAs("member-b") }),
  ).toBe(true);
  // …and A heals again once ITS own window has passed.
  now += HEAL_COOLDOWN_MS;
  expect(
    await healer.attempt({ ...base, actingAs: actingAs("member-a") }),
  ).toBe(true);

  expect(seen).toEqual([
    actingAs("member-a"),
    actingAs("member-b"),
    actingAs("member-a"),
  ]);
});

test("no acting identity keeps the single shared slot (desktop, self-host)", async () => {
  const { seen, heal } = recorder();
  // A real epoch, not 0: the cooldown compares `now - (last ?? 0)`, so a clock
  // that starts at 0 reads a never-attempted key as one attempted this instant.
  let now = 1_700_000_000_000;
  const healer = new CredentialServeHealer(heal, () => now);
  const args = {
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "openai-codex",
  };

  expect(await healer.attempt(args)).toBe(true);
  now += 1_000;
  expect(await healer.attempt(args)).toBe(false);

  expect(seen).toEqual([undefined]);
});
