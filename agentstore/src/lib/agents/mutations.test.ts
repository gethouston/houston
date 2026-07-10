import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/db/schema";
import { ingestIr } from "./ingest";

// Thin mock at the drizzle boundary: applyNewIr's whole race handling lives in the
// retry wrapper around db.transaction(), so controlling how the transaction settles
// exercises the conflict-mapping without a live database.
const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));

const { applyNewIr } = await import("./mutations");

/** A Postgres unique-violation from agent_versions_uniq (SQLSTATE 23505). */
const versionConflict = () =>
  Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
  });

const agent = { id: "agent-1", state: "draft" } as Agent;

function sampleIr() {
  const result = ingestIr({
    identity: {
      name: "Test Agent",
      description: "Does useful things.",
      category: "productivity",
      creator: { displayName: "Dana" },
    },
    instructions: "Be helpful.",
    provenance: { createdVia: "agent-post" },
  });
  if (!result.ok) throw new Error("fixture IR failed to ingest");
  return result.ir;
}

describe("applyNewIr concurrent version race", () => {
  beforeEach(() => transaction.mockReset());

  it("maps an exhausted unique violation to a 409 version_conflict, never a 500", async () => {
    // Every attempt loses the race for (agent_id, version).
    transaction
      .mockRejectedValueOnce(versionConflict())
      .mockRejectedValueOnce(versionConflict())
      .mockRejectedValueOnce(versionConflict());
    const result = await applyNewIr(agent, sampleIr());
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "version_conflict",
    });
    // Bounded: three attempts, then a mapped conflict — no unhandled throw.
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("recovers when a lost race clears on retry", async () => {
    transaction
      .mockRejectedValueOnce(versionConflict())
      .mockResolvedValue(undefined);
    const result = await applyNewIr(agent, sampleIr());
    expect(result).toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("still propagates a genuine (non-unique) failure instead of swallowing it", async () => {
    transaction.mockRejectedValueOnce(new Error("connection reset"));
    let thrown: unknown;
    try {
      await applyNewIr(agent, sampleIr());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("connection reset");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
