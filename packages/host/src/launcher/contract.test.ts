import { describe, expect, test } from "vitest";
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
    waitHealthy: async () => {},
  };
  return new ProcessLauncher(opts);
}

runRuntimeLauncherContract("FakeLauncher", () => new FakeLauncher());
runRuntimeLauncherContract("ProcessLauncher", () => makeProcessLauncher());

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
    await proc.destroy(a.id);
    expect(await proc.status(a.id)).toBe("asleep");
    await proc.sleep("never-seen");
    expect(await proc.status("never-seen")).toBe("asleep");
  });
});
