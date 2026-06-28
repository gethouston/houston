import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as netCreateServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HoustonEvent } from "@houston/protocol";
import { expect, test } from "vitest";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost, type LocalHost } from "./host";

/**
 * The LOCAL adapter profile's two assembled-over-HTTP claims that the
 * dual-profile parity gate cannot reach — both proven against a REAL filesystem
 * (FsVfs + FsWatcher), with the fake spawner, with NO real provider or runtime:
 *
 *   1. A skill created via the API lands at the EXACT on-disk path pi reads
 *      (`<W>/<A>/.agents/skills/<slug>/SKILL.md`). The dual-profile test pins the
 *      WIRE behavior, but normalizes ids and runs cloud against MemoryVfs; it
 *      never asserts the byte file exists where the next pi session loads it.
 *      "Created in the UI → the agent uses it next turn" is exactly that file
 *      being on disk, so this is the local analog of Layer-3 checklist row 4
 *      that DOESN'T need a turn.
 *
 *   2. A raw write under an agent's `.houston` surfaces the correct HoustonEvent
 *      on `/v1/events` — the FsWatcher → EventHub → SSE keystone, ASSEMBLED.
 *      The watcher unit test stops at the callback; the events-stream test
 *      drives only the cloud host-mutation path (MemoryVfs, no watcher). This is
 *      the local profile's whole reactivity story (the analog of cloud's
 *      post-turn synthetic sync — see the documented asymmetry) and the thing
 *      that makes "edit a file → the board updates with no refresh" true, so it
 *      must be machine-checked before engine/ (the watcher's parity oracle) goes.
 */

const TOKEN = "boot-secret";
const auth = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = netCreateServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

// Never invoked — no turn is dispatched in either test (skills + the watcher
// are both intercepted by the host before the runtime channel).
const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

/**
 * Boot the desktop sidecar's exact assembly (buildLocalHost: LocalWorkspaceStore
 * + FsVfs + LocalPaths + FsWatcher + Scheduler) over a temp tree seeded with one
 * agent directory, so workspaces/agents resolve from disk.
 */
async function bootLocal(): Promise<{
  host: LocalHost;
  base: string;
  workspacesRoot: string;
  agentId: string;
}> {
  const workspacesRoot = mkdtempSync(join(tmpdir(), "parity-react-"));
  // Seed the agent tree incl. its `.houston/activity` dir BEFORE the watcher
  // arms (mirrors a real install: schemas are seeded on agent create). The
  // recursive fs.watch then reports the activity.json write at its full path —
  // a dir created AFTER arming can surface as a coarse parent-dir event.
  mkdirSync(join(workspacesRoot, "Work", "Sales", ".houston", "activity"), {
    recursive: true,
  });
  const credentialsPath = join(
    mkdtempSync(join(tmpdir(), "parity-react-cred-")),
    "credentials.json",
  );
  const port = await freePort();
  const host = buildLocalHost({
    workspacesRoot,
    credentialsPath,
    port,
    token: TOKEN,
    runtimeCommand: ["true"],
    spawner: fakeSpawner,
  });
  await host.start();
  return {
    host,
    base: `http://127.0.0.1:${port}`,
    workspacesRoot,
    agentId: "Work/Sales",
  };
}

test("a skill created via the API lands at the exact on-disk path pi loads", async () => {
  const { host, base, workspacesRoot, agentId } = await bootLocal();
  try {
    const created = await fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/skills`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Summarize Inbox",
          description: "Summarize unread email",
          content: "## Procedure\nDo the thing.",
        }),
      },
    );
    expect(created.status).toBe(201);
    expect(((await created.json()) as { name: string }).name).toBe(
      "summarize-inbox",
    );

    // The real bytes are at <workspacesRoot>/Work/Sales/.agents/skills/<slug>/
    // SKILL.md — the directory a fresh pi session reads its skills from. THIS is
    // the "no extra plumbing; the agent uses it next session" guarantee made
    // concrete: the file the next runtime opens, on disk, right now.
    const onDisk = join(
      workspacesRoot,
      "Work",
      "Sales",
      ".agents",
      "skills",
      "summarize-inbox",
      "SKILL.md",
    );
    const body = readFileSync(onDisk, "utf8");
    expect(body).toContain("name: summarize-inbox");
    expect(body).toContain("## Procedure");
  } finally {
    host.stop();
  }
});

/**
 * Open the local host's SSE stream and resolve with the first matching
 * HoustonEvent after `onConnected` (the comment preamble) fires the FS write.
 * The watcher may legitimately emit a broad FilesChanged before the specific
 * ActivityChanged, so ignore non-matching events instead of racing event order.
 * Aborts on settle so the watcher + server unsubscribe; returns "timeout" past
 * budget.
 */
async function waitForEvent(
  base: string,
  onConnected: () => void,
  matches: (event: HoustonEvent) => boolean,
  timeoutMs = 4000,
): Promise<HoustonEvent | "timeout"> {
  const ac = new AbortController();
  const res = await fetch(`${base}/v1/events`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: ac.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  if (!res.body) throw new Error("expected a readable SSE body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let connected = false;
  let buffer = "";
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return "timeout";
      buffer += decoder.decode(value, { stream: true });
      if (!connected && buffer.includes(": connected")) {
        connected = true;
        onConnected();
      }
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice("data: ".length)) as HoustonEvent;
        if (matches(event)) return event;
      }
    }
  } catch {
    return "timeout";
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
}

test("a direct .houston file write surfaces on /v1/events (FsWatcher → SSE)", async () => {
  const { host, base, workspacesRoot } = await bootLocal();
  // The agent (or the user, or an external edit) writes activity.json directly —
  // no host route involved. Reactivity must catch it. This is the local profile
  // analog of cloud's post-turn synthetic FilesChanged: same HoustonEvent
  // vocabulary, different detector (the documented asymmetry).
  const activityDir = join(
    workspacesRoot,
    "Work",
    "Sales",
    ".houston",
    "activity",
  );
  try {
    const event = await waitForEvent(
      base,
      () => {
        // Give the recursive fs.watch a beat to arm after the SSE preamble, then
        // write — the watcher debounces, so a single write is one event.
        setTimeout(() => {
          writeFileSync(
            join(activityDir, "activity.json"),
            JSON.stringify([{ id: "a1", title: "from the agent" }]),
          );
        }, 150);
      },
      (candidate) =>
        candidate.type === "ActivityChanged" &&
        candidate.agentPath === "Work/Sales",
    );
    expect(event).toEqual({
      type: "ActivityChanged",
      agentPath: "Work/Sales",
    });
  } finally {
    host.stop();
  }
});
