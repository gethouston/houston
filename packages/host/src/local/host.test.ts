import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capabilities, Workspace } from "@houston/protocol";
import { expect, test } from "vitest";
import type { Agent } from "../domain/types";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost, LOCAL_CAPABILITIES } from "./host";

/**
 * The local host wired end-to-end at the route level: the SAME server, driven
 * by the local adapter profile (LocalWorkspaceStore + FsVfs + LocalPaths +
 * SingleUserVerifier). No real runtime — the spawner is a fake, since these
 * routes (meta, workspaces, agents, preferences) never dispatch a turn.
 */

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

// A spawner that is never actually invoked here (no turn dispatch in this test).
const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

async function setup(opts?: { chatHistoryDbPath?: string }) {
  const workspacesRoot = mkdtempSync(join(tmpdir(), "houston-localhost-"));
  mkdirSync(join(workspacesRoot, "Work", "Sales"), { recursive: true });
  const port = await freePort();
  const host = buildLocalHost({
    workspacesRoot,
    credentialsPath: join(
      mkdtempSync(join(tmpdir(), "houston-cred-")),
      "credentials.json",
    ),
    port,
    token: "boot-secret",
    runtimeCommand: ["true"],
    spawner: fakeSpawner,
    chatHistoryDbPath: opts?.chatHistoryDbPath,
  });
  await host.start();
  return { host, base: `http://127.0.0.1:${port}`, workspacesRoot };
}

const auth = {
  Authorization: "Bearer boot-secret",
  "Content-Type": "application/json",
};

test("capabilities report the local profile", async () => {
  const { host, base } = await setup();
  try {
    const r = await fetch(`${base}/v1/capabilities`);
    expect(r.status).toBe(200);
    const caps = (await r.json()) as Capabilities;
    expect(caps).toEqual(LOCAL_CAPABILITIES);
    expect(caps.profile).toBe("local");
    expect(caps.codeExecution).toBe("local-bash");
    expect(caps.providers).toEqual(["anthropic", "openai-codex"]);
  } finally {
    host.stop();
  }
});

test("/v1/version reports chatHistoryMigrated=false on a fresh install", async () => {
  const { host, base } = await setup();
  try {
    const v = (await (await fetch(`${base}/v1/version`)).json()) as {
      chatHistoryMigrated: boolean;
    };
    // No legacy db path → not a migrating install; the reconnect moment must
    // never fire for fresh users.
    expect(v.chatHistoryMigrated).toBe(false);
  } finally {
    host.stop();
  }
});

test("/v1/version reports chatHistoryMigrated=true when a legacy db is present", async () => {
  // The flag keys on the db FILE existing (the durable "came from the legacy
  // desktop build" signal), independent of whether the migration parse runs —
  // an unreadable/empty file still marks the user as migrating, and start()
  // swallows the parse failure. We point at a real, present file.
  const dbPath = join(
    mkdtempSync(join(tmpdir(), "houston-legacydb-")),
    "houston.db",
  );
  writeFileSync(dbPath, "");
  const { host, base } = await setup({ chatHistoryDbPath: dbPath });
  try {
    const v = (await (await fetch(`${base}/v1/version`)).json()) as {
      chatHistoryMigrated: boolean;
    };
    expect(v.chatHistoryMigrated).toBe(true);
  } finally {
    host.stop();
  }
});

test("the boot token is required; anything else is 401", async () => {
  const { host, base } = await setup();
  try {
    expect((await fetch(`${base}/agents`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/agents`, {
          headers: { Authorization: "Bearer nope" },
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${base}/agents`, { headers: auth })).status).toBe(200);
  } finally {
    host.stop();
  }
});

test("workspaces + agents are read from the on-disk desktop tree", async () => {
  const { host, base } = await setup();
  try {
    const workspaces = (await (
      await fetch(`${base}/v1/workspaces`, { headers: auth })
    ).json()) as Workspace[];
    expect(workspaces.map((w) => w.id)).toEqual(["Work"]);

    // GET /agents lists the (default = first) workspace's agents.
    const agents = (await (
      await fetch(`${base}/agents`, { headers: auth })
    ).json()) as Agent[];
    expect(agents.map((a) => a.id)).toEqual(["Work/Sales"]);
  } finally {
    host.stop();
  }
});

test("a slash-bearing agent id round-trips through the URL (encode → decode)", async () => {
  const { host, base } = await setup();
  try {
    // The activities route is served by the host (no runtime needed); reaching
    // it proves /agents/Work%2FSales/... decodes back to the "Work/Sales" agent.
    const r = await fetch(
      `${base}/agents/${encodeURIComponent("Work/Sales")}/activities`,
      { headers: auth },
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  } finally {
    host.stop();
  }
});

test("preferences persist via the vfs under the workspace", async () => {
  const { host, base } = await setup();
  try {
    await fetch(`${base}/v1/preferences/locale`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ value: "es" }),
    });
    const got = await fetch(`${base}/v1/preferences/locale`, { headers: auth });
    expect(((await got.json()) as { value: string }).value).toBe("es");
  } finally {
    host.stop();
  }
});
