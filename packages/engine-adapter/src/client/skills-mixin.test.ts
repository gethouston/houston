import { describe, expect, test, vi } from "vitest";
import type { HoustonClientBase } from "./base";

/**
 * The two composed acts on a workspace skill are a manifest write FOLLOWED by
 * the delete of the agent's own copy. The second half can fail with the first
 * already stored, so the act rejects while the agent's skills really did
 * change: an echo that only follows a whole success leaves every list, manifest
 * and open skill showing the state from before a write that happened.
 */

const { emitLocalEcho } = vi.hoisted(() => ({ emitLocalEcho: vi.fn() }));
vi.mock("../bus", () => ({ emitLocalEcho }));
vi.mock("../control-plane", () => ({
  agentPath: (path: string) => `/agents/${path}`,
  agentIdOfPath: () => null,
}));

const { SkillsMixin } = await import("./skills-mixin");

/** A client whose SDK acts all fail the way a delete after the manifest write
 *  does: a status-bearing transport error. */
function client(act: () => Promise<void>) {
  class Base {
    ctx = {
      cp: {},
      sdk: {
        skills: {
          agent: {
            disableSkillForAgent: act,
            revertSkillOverride: act,
          },
        },
      },
    };
  }
  return new (SkillsMixin(Base as unknown as new () => HoustonClientBase))();
}

const refused = async (): Promise<void> => {
  const err = new Error(JSON.stringify({ error: "read-only" }));
  (err as Error & { status: number }).status = 403;
  throw err;
};

describe.each([
  ["disableSkillForAgent" as const],
  ["revertSkillOverride" as const],
])("%s", (method) => {
  test("echoes the change and keeps the rejection when it failed partway", async () => {
    emitLocalEcho.mockClear();
    const skills = client(refused);

    await expect(skills[method]("a1", "triage")).rejects.toMatchObject({
      status: 403,
    });

    expect(emitLocalEcho).toHaveBeenCalledWith("SkillsChanged", {
      agentPath: "a1",
    });
  });

  test("echoes the change when the act landed whole", async () => {
    emitLocalEcho.mockClear();
    const skills = client(async () => {});

    await skills[method]("a1", "triage");

    expect(emitLocalEcho).toHaveBeenCalledWith("SkillsChanged", {
      agentPath: "a1",
    });
  });
});
