import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveFakeHostPort,
  WORKTREE_PORT_STRIDE,
  worktreePortOffset,
} from "./config";

describe("worktreePortOffset", () => {
  it("is stable for one worktree and inside the stride budget", () => {
    const offset = worktreePortOffset();
    expect(offset).toBe(worktreePortOffset());
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(100);
  });

  it("distinguishes sibling worktrees", () => {
    // Each worktree root carries its own pnpm-workspace.yaml, so parallel
    // checkouts hash their own roots. With 100 buckets a single pair may
    // collide by honest chance; five siblings all landing in one bucket
    // would mean the hash is broken, so that is what the test rules out.
    const base = mkdtempSync(path.join(os.tmpdir(), "houston-offset-"));
    const offsets = new Set(
      ["a", "b", "c", "d", "e"].map((name) => {
        const root = path.join(base, `worktree-${name}`);
        mkdirSync(root);
        writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
        return worktreePortOffset(root);
      }),
    );
    try {
      expect(offsets.size).toBeGreaterThan(1);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("resolveFakeHostPort", () => {
  const derivedBase = 28100 + worktreePortOffset() * WORKTREE_PORT_STRIDE;

  it("derives the base per worktree outside a Playwright worker", () => {
    expect(resolveFakeHostPort({})).toBe(derivedBase);
  });

  it("honors the per-worktree base-port override", () => {
    expect(resolveFakeHostPort({ HOUSTON_E2E_FAKE_HOST_PORT: "4460" })).toBe(
      4460,
    );
  });

  it("gives each Playwright parallel slot its own port above the base", () => {
    expect(resolveFakeHostPort({ TEST_PARALLEL_INDEX: "0" })).toBe(
      derivedBase + 1,
    );
    expect(resolveFakeHostPort({ TEST_PARALLEL_INDEX: "3" })).toBe(
      derivedBase + 4,
    );
  });

  it("stays below the Linux ephemeral-port floor in the worst bucket", () => {
    // A derived port at or above 32768 (net.ipv4.ip_local_port_range floor)
    // collides with kernel-assigned ephemeral sockets on CI runners and fails
    // Playwright's webServer pre-launch check before any test runs.
    const worstBase = 28100 + 99 * WORKTREE_PORT_STRIDE;
    const worstSlot = worstBase + WORKTREE_PORT_STRIDE - 1;
    expect(worstSlot).toBeLessThan(32768);
  });

  it("stacks the slot offset on top of a base-port override", () => {
    expect(
      resolveFakeHostPort({
        HOUSTON_E2E_FAKE_HOST_PORT: "4460",
        TEST_PARALLEL_INDEX: "2",
      }),
    ).toBe(4463);
  });
});
