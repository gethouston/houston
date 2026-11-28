import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { prepareTurnFilesystem, startTurnFilesystem } from "./turn-filesystem";

/** The turn's filesystem carries what its startup hydrate fetched, for the
 *  terminal frame (turn-terminal.ts). Deferred files load behind the prompt
 *  and stay out of it. */

const prefix = "ws/w1/agent-1";
const agentRel = "workspaces/Personal/Bob";

function seededStore() {
  const storeRoot = mkdtempSync(join(tmpdir(), "startup-load-"));
  const agent = join(storeRoot, prefix, ...agentRel.split("/"));
  mkdirSync(join(agent, ".houston", "routines"), { recursive: true });
  mkdirSync(join(agent, "files"), { recursive: true });
  writeFileSync(join(agent, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agent, ".houston", "routines", "routines.json"), "[]");
  writeFileSync(join(agent, "files", "report.csv"), "a,b,c,d\n");
  return new LocalDirStore(storeRoot);
}

test("an eager turn reports the objects and bytes its startup hydrate fetched", async () => {
  const preparation = await startTurnFilesystem({
    store: seededStore(),
    prefix,
    root: mkdtempSync(join(tmpdir(), "startup-load-root-")),
    claimed: true,
    defer: (rel) => rel === `${agentRel}/files/report.csv`,
  });
  const fs = await preparation.hydrated;
  expect(fs.startupLoad).toEqual({
    objects: 2,
    bytes: "# Bob\n".length + "[]".length,
  });
  expect(await preparation.settled).toMatchObject({ ok: true });
  expect(fs.manifest.size).toBe(3);
  expect(fs.startupLoad.objects).toBe(2);
});

test("a lazy turn fetches nothing at startup", async () => {
  const fs = await prepareTurnFilesystem({
    store: seededStore(),
    prefix,
    root: mkdtempSync(join(tmpdir(), "startup-load-lazy-")),
    claimed: true,
    lazy: true,
  });
  expect(fs.startupLoad).toEqual({ objects: 0, bytes: 0 });
});
