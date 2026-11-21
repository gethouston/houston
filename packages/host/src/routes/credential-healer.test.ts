import { expect, test, vi } from "vitest";
import { RevocationTombstones } from "../credentials/revocation-tombstones";
import { AgentRenamingError, LauncherClosedError } from "../ports";
import {
  type CredentialHeal,
  CredentialServeHealer,
} from "./credential-healer";

const HEAL_COOLDOWN_MS = 5 * 60_000;

function actingAs(sub: string): string {
  return `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;
}

function recorder(result = true) {
  const seen: (string | undefined)[] = [];
  const heal: CredentialHeal = async (args) => {
    seen.push(args.actingAs);
    return result;
  };
  return { seen, heal };
}

test("a member's heal is not coalesced into another member's in-flight attempt", async () => {
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
  let now = 1_700_000_000_000;
  const healer = new CredentialServeHealer(heal, () => now);
  const base = {
    workspaceId: "ws",
    agentId: "ws/agent",
    provider: "openai-codex",
  };

  await healer.attempt({ ...base, actingAs: actingAs("member-a") });
  now += 1_000;
  expect(
    await healer.attempt({ ...base, actingAs: actingAs("member-a") }),
  ).toBe(false);
  expect(
    await healer.attempt({ ...base, actingAs: actingAs("member-b") }),
  ).toBe(true);
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

  revocations.mark({ workspaceId: "ws", provider: "anthropic", scope: "team" });
  expect(await healer.attempt(args)).toBe(false);
  expect(seen).toEqual([]);

  revocations.clear({ workspaceId: "ws", provider: "anthropic" });
  now += 1_000;
  expect(await healer.attempt(args)).toBe(true);
  expect(seen).toEqual([undefined]);
});

test("no acting identity keeps the single shared slot (desktop, self-host)", async () => {
  const { seen, heal } = recorder();
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

test("a heal refused by the rename latch is the rename, not a fault, and spends no cooldown (PRODUCT-1804)", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let now = 1_700_000_000_000;
  let held = true;
  const seen: string[] = [];
  const healer = new CredentialServeHealer(
    async ({ agentId }) => {
      seen.push(agentId);
      if (held) throw new AgentRenamingError(agentId);
      return true;
    },
    () => now,
  );
  await expect(
    healer.attempt({ workspaceId: "ws", agentId: "ws/old", provider: "xai" }),
  ).rejects.toBeInstanceOf(AgentRenamingError);
  expect(errors).not.toHaveBeenCalled();
  held = false;
  now += 1_000;
  expect(
    await healer.attempt({
      workspaceId: "ws",
      agentId: "ws/new",
      provider: "xai",
    }),
  ).toBe(true);
  expect(seen).toEqual(["ws/old", "ws/new"]);
  errors.mockRestore();
});

test("a heal that dies once the host is draining is the drain, not a fault", async () => {
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

test("a runtime unreachable for the whole sweep reports one Sentry error per incident (PRODUCT-1687)", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  let now = 1_700_000_000_000;
  const refused = () =>
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    });
  const healer = new CredentialServeHealer(
    async () => {
      throw refused();
    },
    () => now,
  );
  const base = { workspaceId: "ws", agentId: "ws/agent" };
  await Promise.all(
    ["xai", "openai", "mistral"].map((provider) =>
      healer.attempt({ ...base, provider }),
    ),
  );
  expect(errors).toHaveBeenCalledTimes(1);
  expect(errors.mock.calls[0]?.[1]).toBe("fetch failed (cause: ECONNREFUSED)");
  expect(warns).toHaveBeenCalledTimes(2);
  expect(warns.mock.calls[0]?.[0]).toContain("same incident");

  now += 4 * 60_000;
  await healer.attempt({ ...base, provider: "groq" });
  expect(errors).toHaveBeenCalledTimes(1);

  await healer.attempt({ ...base, agentId: "ws/other", provider: "cerebras" });
  expect(errors).toHaveBeenCalledTimes(2);

  now += 6 * 60_000;
  await healer.attempt({ ...base, provider: "xai" });
  expect(errors).toHaveBeenCalledTimes(3);
  errors.mockRestore();
  warns.mockRestore();
});

test("a non-network heal failure is never collapsed into an incident", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const healer = new CredentialServeHealer(async () => {
    throw new Error("gateway rejected the credential");
  });
  const base = { workspaceId: "ws", agentId: "ws/agent" };
  await healer.attempt({ ...base, provider: "xai" });
  await healer.attempt({ ...base, provider: "openai" });
  expect(errors).toHaveBeenCalledTimes(2);
  errors.mockRestore();
});
