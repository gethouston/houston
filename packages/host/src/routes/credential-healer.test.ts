import { expect, test, vi } from "vitest";
import { RevocationTombstones } from "../credentials/revocation-tombstones";
import { LauncherClosedError } from "../ports";
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

test("a heal is refused while the provider's revocation tombstone is active (HOUSTON-APP-530)", async () => {
  const { seen, heal } = recorder();
  let now = 1_700_000_000_000;
  const revocations = new RevocationTombstones(() => now);
  const healer = new CredentialServeHealer(heal, () => now, revocations);
  const args = {
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "anthropic",
  };

  // The serve miss exists BECAUSE the provider revoked the credential; healing
  // would re-upload the pod's copy of the same dead family.
  revocations.mark({ workspaceId: "ws", provider: "anthropic", scope: "team" });
  expect(await healer.attempt(args)).toBe(false);
  expect(seen).toEqual([]);

  // A fresh user-driven connect clears the tombstone; healing resumes — and
  // the refusal above must not have spent the cooldown.
  revocations.clear({ workspaceId: "ws", provider: "anthropic" });
  now += 1_000;
  expect(await healer.attempt(args)).toBe(true);
  expect(seen).toEqual([undefined]);
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

test("a launcher refusal mid-shutdown rethrows its closed shape without a Sentry error (PRODUCT-1672)", async () => {
  // ensureAwake throws LauncherClosedError once stop() latched the launcher.
  // That is the drain, not a fault: the route must answer the waking shape,
  // and nothing may reach console.error (every console.error is a Sentry
  // event on a managed pod).
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const healer = new CredentialServeHealer(async () => {
    throw new LauncherClosedError();
  });
  await expect(
    healer.attempt({ workspaceId: "ws", agentId: "ws/agent", provider: "xai" }),
  ).rejects.toBeInstanceOf(LauncherClosedError);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test("a heal that dies once the host is draining is the drain, not a fault", async () => {
  // The runtime was killed under the export fetch: undici's bare "fetch
  // failed". With the host draining that is the same shutdown.
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let draining = false;
  const healer = new CredentialServeHealer(
    async () => {
      draining = true;
      throw new TypeError("fetch failed");
    },
    undefined,
    undefined,
    () => draining,
  );
  await expect(
    healer.attempt({ workspaceId: "ws", agentId: "ws/agent", provider: "xai" }),
  ).rejects.toBeInstanceOf(LauncherClosedError);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test("a draining host refuses the heal before it starts and spends no cooldown", async () => {
  const { seen, heal } = recorder();
  let now = 1_700_000_000_000;
  let draining = true;
  const healer = new CredentialServeHealer(
    heal,
    () => now,
    undefined,
    () => draining,
  );
  const args = { workspaceId: "ws", agentId: "ws/agent", provider: "xai" };
  await expect(healer.attempt(args)).rejects.toBeInstanceOf(
    LauncherClosedError,
  );
  expect(seen).toEqual([]);
  // The refusal must not have burned the cooldown: a host that stops draining
  // (tests, a cancelled shutdown) heals on the very next miss.
  draining = false;
  now += 1_000;
  expect(await healer.attempt(args)).toBe(true);
  expect(seen).toEqual([undefined]);
});

test("a heal that fails on a live host stays a loud error and names the cause", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const healer = new CredentialServeHealer(async () => {
    throw new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    });
  });
  expect(
    await healer.attempt({
      workspaceId: "ws",
      agentId: "ws/agent",
      provider: "xai",
    }),
  ).toBe(false);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(errors.mock.calls[0]?.[1]).toBe("fetch failed (cause: ECONNREFUSED)");
  errors.mockRestore();
});
