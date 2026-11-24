import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { adoptKeptMode } from "./turn-kept-mode";
import type { TurnRequest } from "./types";

const workspaceDir = mkdtempSync(join(tmpdir(), "turn-kept-mode-"));
mkdirSync(join(workspaceDir, ".houston", "activity"), { recursive: true });
writeFileSync(
  join(workspaceDir, ".houston", "activity", "activity.json"),
  JSON.stringify([
    {
      id: "m1",
      title: "Report",
      description: "",
      status: "done",
      mode: "plan",
    },
  ]),
);
afterAll(() => rmSync(workspaceDir, { recursive: true, force: true }));

const turn = (over: Partial<TurnRequest>): TurnRequest =>
  ({
    conversationId: "activity-m1",
    liveMode: { current: "execute" },
    ...over,
  }) as TurnRequest;

test("a pin-less turn adopts the kept mode, live mode included", async () => {
  const t = turn({});
  await adoptKeptMode(t, workspaceDir);
  expect(t.mode).toBe("plan");
  expect(t.liveMode?.current).toBe("plan");
});

test("a pinned turn keeps its pin", async () => {
  const t = turn({ mode: "auto", liveMode: { current: "auto" } });
  await adoptKeptMode(t, workspaceDir);
  expect(t.mode).toBe("auto");
  expect(t.liveMode?.current).toBe("auto");
});

test("a routine run never adopts a person's pick: it runs Autopilot", async () => {
  const t = turn({ routine: { id: "r1" } as TurnRequest["routine"] });
  await adoptKeptMode(t, workspaceDir);
  expect(t.mode).toBeUndefined();
  expect(t.liveMode?.current).toBe("execute");
});
