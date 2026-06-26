import { describe, expect, test } from "bun:test";
import type { Agent } from "../domain/types";
import {
  launcherAgent as agent,
  runRuntimeLauncherContract,
} from "../testing/launcher-contract";
import { FakeLauncher } from "./fake";
import {
  ProcessLauncher,
  type ProcessLauncherOptions,
  type RuntimeHandle,
  type RuntimeSpawner,
} from "./process";

/**
 * The OPEN RuntimeLauncher adapters run through the shared contract
 * (../testing/launcher-contract.ts → runRuntimeLauncherContract):
 *   - FakeLauncher (the cloud 3-state model used in tests), and
 *   - ProcessLauncher, driven through INJECTED doubles (a recording spawner + an
 *     instant health probe) so the contract is a pure unit test. No real
 *     subprocess is spawned here.
 *
 * The CLOSED GkeLauncher needs a live Kubernetes apiserver (one Deployment +
 * Service + PVC per agent); it runs the SAME contract + an apiserver-object
 * reconcile/idempotency suite in `@houston/host-cloud`
 * (launcher/gke.integration.test.ts), gated on HOUSTON_GKE_TEST and pointed at a
 * real or `kind` cluster. The contract function lives on the open side of the
 * seam; only the adapters differ.
 *
 * INTENTIONAL DIVERGENCES (NOT part of the shared contract — pinned per-impl in
 * fake.test.ts / process.test.ts and the divergence block below):
 *   - status's "absent" state. FakeLauncher models running → asleep → absent so
 *     destroy reports "absent" and sleeping an unknown agent THROWS.
 *     ProcessLauncher has no "absent": a laptop process is either up ("running")
 *     or not ("asleep"); sleeping an unknown agent is a silent no-op and destroy
 *     == sleep. The contract only asserts the running/asleep transitions both
 *     share, never the post-destroy state.
 *   - endpoint VALUE. Fake hands back one configurable URL; Process allocates a
 *     loopback port per spawn. The contract only requires a non-empty baseUrl +
 *     token, never a specific value.
 */

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

// GkeLauncher: behavioral contract genuinely needs a live Kubernetes apiserver
// (one Deployment + Service + PVC per agent). It CANNOT run in this sandbox — no
// cluster, no docker. It is NOT faked: the real GkeLauncher runs this same
// contract + an apiserver-object reconcile/idempotency suite in
// @houston/host-cloud's launcher/gke.integration.test.ts, gated on
// HOUSTON_GKE_TEST and pointed at a real or `kind` cluster. This marker stays so
// the boundary is explicit here in the open contract file.
test.todo("RuntimeLauncher contract: GkeLauncher → @houston/host-cloud launcher/gke.integration.test.ts (HOUSTON_GKE_TEST + a cluster)", () => {});
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
