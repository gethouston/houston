import { describe, expect, test } from "vitest";
import type { Agent } from "../domain/types";
import type { RuntimeLauncher } from "../ports";

export const launcherAgent = (id: string): Agent => ({
  id,
  workspaceId: "w1",
  name: id,
  createdAt: 0,
});

export function runRuntimeLauncherContract(
  name: string,
  make: () => RuntimeLauncher,
): void {
  describe(`RuntimeLauncher contract: ${name}`, () => {
    test("ensureAwake returns a reachable endpoint and marks the agent running", async () => {
      const l = make();
      const a = launcherAgent("a1");
      const ep = await l.ensureAwake(a);
      expect(ep.baseUrl).toBeTruthy();
      expect(ep.token).toBeTruthy();
      expect(await l.status(a.id)).toBe("running");
    });

    test("ensureAwake is idempotent — a warm runtime is reused, not respawned", async () => {
      const l = make();
      const a = launcherAgent("a2");
      const first = await l.ensureAwake(a);
      const second = await l.ensureAwake(a);
      expect(second).toEqual(first);
      expect(await l.status(a.id)).toBe("running");
    });

    test("sleep stops it; ensureAwake afterwards re-wakes it", async () => {
      const l = make();
      const a = launcherAgent("a3");
      await l.ensureAwake(a);
      await l.sleep(a.id);
      expect(await l.status(a.id)).toBe("asleep");

      await l.ensureAwake(a);
      expect(await l.status(a.id)).toBe("running");
    });

    test("independent agents track state separately", async () => {
      const l = make();
      const a = launcherAgent("a4");
      const b = launcherAgent("b4");
      await l.ensureAwake(a);
      await l.ensureAwake(b);
      await l.sleep(a.id);
      expect(await l.status(a.id)).toBe("asleep");
      expect(await l.status(b.id)).toBe("running");
    });
  });
}
