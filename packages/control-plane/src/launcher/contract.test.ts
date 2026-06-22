import { describe, test, expect } from "bun:test";
import type { Agent } from "../domain/types";
import type { RuntimeLauncher } from "../ports";
import { FakeLauncher } from "./fake";
import {
  ProcessLauncher,
  type ProcessLauncherOptions,
  type RuntimeHandle,
  type RuntimeSpawner,
} from "./process";

/**
 * The RuntimeLauncher CONTRACT, run verbatim against every locally-testable
 * adapter — the anti-drift net for the standing-runtime lifecycle port. Every
 * impl must agree on the lifecycle the ProxyChannel drives: ensureAwake returns
 * a reachable endpoint and marks the agent running, ensureAwake is idempotent
 * (a warm runtime is reused, not respawned), sleep then ensureAwake re-wakes,
 * and independent agents track state separately.
 *
 * ProcessLauncher is driven through INJECTED doubles (a recording spawner + an
 * instant health probe) so the contract is a pure unit test — the same doubles
 * its own process.test.ts uses. No real subprocess is spawned here.
 *
 * INTENTIONAL DIVERGENCES (NOT part of the shared contract — pinned per-impl in
 * fake.test.ts / process.test.ts and in the divergence block below):
 *   - status's "absent" state. FakeLauncher models the full cloud 3-state
 *     machine (running → asleep → absent) so destroy reports "absent" and
 *     sleeping an unknown agent THROWS. ProcessLauncher has no "absent": a
 *     laptop process is either up ("running") or not ("asleep"); sleeping an
 *     unknown agent is a silent no-op (pi's continueRecent restores on the next
 *     wake) and destroy == sleep (the user owns the files; there's no volume to
 *     drop). The contract therefore only asserts the running/asleep transitions
 *     both share, never the post-destroy state.
 *   - endpoint VALUE. Fake hands back one configurable URL; Process allocates a
 *     loopback port per spawn. The contract only requires a non-empty baseUrl +
 *     token, never a specific value.
 *
 * NOT CONTRACT-TESTED LOCALLY:
 *   - GkeLauncher (launcher/gke.ts) needs a live Kubernetes apiserver (one
 *     Deployment + Service + PVC per agent). Exercised by a cluster integration
 *     run, not unit-faked.
 *   - There is NO CloudRun launcher: per-turn runtimes have no standing instance
 *     to launch (the TurnChannel + dispatchTurn path replaces it). Nothing to
 *     contract-test — recorded here so the absence is intentional, not an
 *     overlooked port.
 *   Both are marked with a test.todo below so the boundary is explicit.
 */
const agent = (id: string): Agent => ({
  id,
  workspaceId: "w1",
  name: id,
  createdAt: 0,
});

function runRuntimeLauncherContract(
  name: string,
  make: () => RuntimeLauncher,
): void {
  describe(`RuntimeLauncher contract: ${name}`, () => {
    test("ensureAwake returns a reachable endpoint and marks the agent running", async () => {
      const l = make();
      const a = agent("a1");
      const ep = await l.ensureAwake(a);
      expect(ep.baseUrl).toBeTruthy();
      expect(ep.token).toBeTruthy();
      expect(await l.status(a.id)).toBe("running");
    });

    test("ensureAwake is idempotent — a warm runtime is reused, not respawned", async () => {
      const l = make();
      const a = agent("a2");
      const first = await l.ensureAwake(a);
      const second = await l.ensureAwake(a);
      expect(second).toEqual(first);
      expect(await l.status(a.id)).toBe("running");
    });

    test("sleep stops it; ensureAwake afterwards re-wakes it", async () => {
      const l = make();
      const a = agent("a3");
      await l.ensureAwake(a);
      await l.sleep(a.id);
      expect(await l.status(a.id)).toBe("asleep");

      await l.ensureAwake(a);
      expect(await l.status(a.id)).toBe("running");
    });

    test("independent agents track state separately", async () => {
      const l = make();
      const a = agent("a4");
      const b = agent("b4");
      await l.ensureAwake(a);
      await l.ensureAwake(b);
      await l.sleep(a.id);
      expect(await l.status(a.id)).toBe("asleep");
      expect(await l.status(b.id)).toBe("running");
    });
  });
}

/** A recording spawner + instant health probe so ProcessLauncher runs as a
 *  pure unit (no real subprocess). Mirrors process.test.ts's doubles. */
function makeProcessLauncher(): ProcessLauncher {
  let nextPort = 6000;
  const spawner: RuntimeSpawner = {
    spawn() {
      const port = nextPort++;
      const handle: RuntimeHandle = { port, kill: () => {} };
      return handle;
    },
  };
  const opts: ProcessLauncherOptions = {
    spawner,
    workspaceDirFor: (a: Agent) => `/houston/${a.id}/workspace`,
    dataDirFor: (a: Agent) => `/houston/${a.id}/data`,
    mintToken: (a: Agent) => `token-${a.id}`,
    waitHealthy: async () => {}, // healthy immediately
  };
  return new ProcessLauncher(opts);
}

runRuntimeLauncherContract("FakeLauncher", () => new FakeLauncher());
runRuntimeLauncherContract("ProcessLauncher", () => makeProcessLauncher());

// GkeLauncher: behavioral contract needs a live Kubernetes apiserver — out of
// scope for `bun test`. Its reconcile steps surface every apiserver error except
// deliberate 404/409 idempotency control flow (launcher/reconcile.ts). Exercised
// by a cluster integration run.
test.todo("RuntimeLauncher contract: GkeLauncher (needs a live Kubernetes apiserver — integration pass)", () => {});
// CloudRun: per-turn runtimes have NO launcher (nothing stands between turns);
// the TurnChannel + dispatchTurn path replaces it. Recorded so the absence is
// an explicit design fact, not an overlooked adapter.
test.todo("RuntimeLauncher contract: CloudRun has no launcher by design (per-turn runtime)", () => {});

describe("RuntimeLauncher divergences (asserted per-impl, NOT in the shared contract)", () => {
  test("Fake reports 'absent' after destroy and throws on sleeping an unknown agent", async () => {
    const fake = new FakeLauncher();
    const a = agent("z1");
    await fake.ensureAwake(a);
    await fake.destroy(a.id);
    expect(await fake.status(a.id)).toBe("absent");
    await expect(fake.sleep("never-seen")).rejects.toThrow(/unknown agent/);
  });

  test("Process has no 'absent' state: destroy == sleep, sleeping an unknown agent is a no-op", async () => {
    const proc = makeProcessLauncher();
    const a = agent("z2");
    await proc.ensureAwake(a);
    await proc.destroy(a.id); // local destroy just stops the process
    expect(await proc.status(a.id)).toBe("asleep"); // never "absent"
    await proc.sleep("never-seen"); // no-op, not a throw (continueRecent restores on wake)
    expect(await proc.status("never-seen")).toBe("asleep");
  });
});
