import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as netCreateServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HoustonEvent } from "@houston/protocol";
import { expect, test } from "vitest";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost, type LocalHost } from "./host";

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

const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

async function bootLocal(): Promise<{
  host: LocalHost;
  base: string;
  workspacesRoot: string;
  agentId: string;
}> {
  const workspacesRoot = mkdtempSync(join(tmpdir(), "parity-react-"));
  for (const dir of ["activity", "runtime/conversations"]) {
    mkdirSync(join(workspacesRoot, "Work", "Sales", ".houston", dir), {
      recursive: true,
    });
  }
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

test("a runtime transcript write surfaces ConversationsChanged on /v1/events", async () => {
  const { host, base, workspacesRoot } = await bootLocal();
  const conversationsDir = join(
    workspacesRoot,
    "Work",
    "Sales",
    ".houston",
    "runtime",
    "conversations",
  );
  try {
    const event = await waitForEvent(
      base,
      () => {
        setTimeout(() => {
          writeFileSync(
            join(conversationsDir, "activity-a1.json"),
            JSON.stringify({ id: "activity-a1", messages: [] }),
          );
        }, 150);
      },
      (candidate) =>
        candidate.type === "ConversationsChanged" &&
        candidate.agentPath === "Work/Sales",
    );
    expect(event).toEqual({
      type: "ConversationsChanged",
      agentPath: "Work/Sales",
    });
  } finally {
    host.stop();
  }
});

test("a direct .houston file write surfaces on /v1/events (FsWatcher → SSE)", async () => {
  const { host, base, workspacesRoot } = await bootLocal();
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
