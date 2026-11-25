import { saveActivities } from "@houston/domain";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryVfs } from "../vfs";
import {
  MAX_AGENT_STARTED_MISSIONS,
  missionFanout,
  readRemoteMissionStatus,
} from "./mission-fanout";

/**
 * The caller-side budget: what ONE agent has out across every board. A per-board
 * cap cannot see it, which is the whole reason this ledger exists.
 */

const CALLER = "ws/Helper";
const ROOT = "workspaces/ws/Dobby";

afterEach(() => missionFanout.forget(CALLER));

const row = (id: string, status: string) => ({
  id,
  title: id,
  description: "",
  status,
});

test("an agent with nothing out has spent nothing", async () => {
  expect(await missionFanout.running(CALLER, new MemoryVfs())).toBe(0);
});

test("a local start stops counting once its row is no longer running", async () => {
  const vfs = new MemoryVfs();
  await saveActivities(vfs, ROOT, [row("m-1", "running"), row("m-2", "done")]);
  missionFanout.record(CALLER, { missionId: "m-1", boardRoot: ROOT });
  missionFanout.record(CALLER, { missionId: "m-2", boardRoot: ROOT });
  // m-3 was deleted from the board entirely.
  missionFanout.record(CALLER, { missionId: "m-3", boardRoot: ROOT });
  expect(await missionFanout.running(CALLER, vfs)).toBe(1);
});

test("a cross-pod start remains charged after the hold while it is running", async () => {
  const vfs = new MemoryVfs();
  const started = Date.now();
  missionFanout.record(
    CALLER,
    {
      missionId: "m-r",
      boardRoot: null,
      readStatus: async () => "running",
    },
    started,
  );
  expect(await missionFanout.running(CALLER, vfs, started + 60_000)).toBe(1);
  expect(
    await missionFanout.running(CALLER, vfs, started + 24 * 3600_000),
  ).toBe(1);
});

test("twenty remote starts stay capped past the hold until observed settled", async () => {
  const vfs = new MemoryVfs();
  const started = Date.now();
  let status: "running" | "settled" = "running";
  for (let i = 0; i < MAX_AGENT_STARTED_MISSIONS; i++) {
    missionFanout.record(
      CALLER,
      {
        missionId: `m-${i}`,
        boardRoot: null,
        readStatus: async () => status,
      },
      started,
    );
  }
  expect(await missionFanout.running(CALLER, vfs, started + 2 * 3600_000)).toBe(
    MAX_AGENT_STARTED_MISSIONS,
  );
  status = "settled";
  expect(await missionFanout.running(CALLER, vfs, started + 3 * 3600_000)).toBe(
    0,
  );
});

test("unknown remote status releases its slot after the hold", async () => {
  const vfs = new MemoryVfs();
  const started = Date.now();
  missionFanout.record(
    CALLER,
    {
      missionId: "m-r",
      boardRoot: null,
      readStatus: async () => "unknown",
    },
    started,
  );
  expect(await missionFanout.running(CALLER, vfs, started + 60_000)).toBe(1);
  expect(await missionFanout.running(CALLER, vfs, started + 2 * 3600_000)).toBe(
    0,
  );
});

test.each([403, 404])(
  "remote refusal %i releases its slot after the hold",
  async (status) => {
    const vfs = new MemoryVfs();
    const started = Date.now();
    const route = {
      target: {
        remote: true as const,
        id: "target",
        name: "Target",
        workspace: "Space",
        workspaceId: "ws",
      },
      gateway: { url: "https://gateway.test", token: "token" },
      fetchImpl: (async () =>
        Response.json({ error: "gone" }, { status })) as typeof fetch,
    };
    missionFanout.record(
      CALLER,
      {
        missionId: "m-r",
        boardRoot: null,
        readStatus: async () => readRemoteMissionStatus(route, "m-r"),
      },
      started,
    );
    expect(
      await missionFanout.running(CALLER, vfs, started + 2 * 3600_000),
    ).toBe(0);
  },
);

test("a missing remote row releases its slot after the hold", async () => {
  const started = Date.now();
  const route = {
    target: {
      remote: true as const,
      id: "target",
      name: "Target",
      workspace: "Space",
      workspaceId: "ws",
    },
    gateway: { url: "https://gateway.test", token: "token" },
    fetchImpl: (async () =>
      Response.json({ error: "missing row" })) as typeof fetch,
  };
  missionFanout.record(
    CALLER,
    {
      missionId: "missing",
      boardRoot: null,
      readStatus: async () => readRemoteMissionStatus(route, "missing"),
    },
    started,
  );
  expect(
    await missionFanout.running(
      CALLER,
      new MemoryVfs(),
      started + 2 * 3600_000,
    ),
  ).toBe(0);
});

test("a deleted remote row with a readable transcript releases after the hold", async () => {
  const started = Date.now();
  const route = {
    target: {
      remote: true as const,
      id: "target",
      name: "Target",
      workspace: "Space",
      workspaceId: "ws",
    },
    gateway: { url: "https://gateway.test", token: "token" },
    fetchImpl: (async () =>
      Response.json({
        id: "deleted",
        title: "Old chat",
        messages: [],
      })) as typeof fetch,
  };
  missionFanout.record(
    CALLER,
    {
      missionId: "deleted",
      boardRoot: null,
      readStatus: () => readRemoteMissionStatus(route, "deleted"),
    },
    started,
  );
  expect(
    await missionFanout.running(
      CALLER,
      new MemoryVfs(),
      started + 60 * 60_000 + 1,
    ),
  ).toBe(0);
});

test("failed remote status reads are cached for 60 seconds while the slot stays held", async () => {
  const started = Date.now();
  let checks = 0;
  missionFanout.record(
    CALLER,
    {
      missionId: "outage",
      boardRoot: null,
      readStatus: async () => {
        checks++;
        throw new Error("gateway unavailable");
      },
    },
    started,
  );
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      await missionFanout.running(
        CALLER,
        new MemoryVfs(),
        started + 60 * 60_000 + 1,
      ),
    ).toBe(1);
    expect(
      await missionFanout.running(
        CALLER,
        new MemoryVfs(),
        started + 60 * 60_000 + 59_000,
      ),
    ).toBe(1);
    expect(checks).toBe(1);
    expect(
      await missionFanout.running(
        CALLER,
        new MemoryVfs(),
        started + 60 * 60_000 + 60_001,
      ),
    ).toBe(1);
    expect(checks).toBe(2);
  } finally {
    report.mockRestore();
  }
});

test("transient remote failure keeps all twenty slots after the hold", async () => {
  const vfs = new MemoryVfs();
  const started = Date.now();
  for (let i = 0; i < MAX_AGENT_STARTED_MISSIONS; i++) {
    missionFanout.record(
      CALLER,
      {
        missionId: `m-${i}`,
        boardRoot: null,
        readStatus: async () => {
          throw new Error("gateway unavailable");
        },
      },
      started,
    );
  }
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      await missionFanout.running(CALLER, vfs, started + 2 * 3600_000),
    ).toBe(MAX_AGENT_STARTED_MISSIONS);
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("m-0"),
      expect.any(Error),
    );
  } finally {
    report.mockRestore();
  }
});

test("a transient remote failure releases at the 24 hour ceiling and reports it", async () => {
  const started = Date.now();
  missionFanout.record(
    CALLER,
    {
      missionId: "timeout",
      boardRoot: null,
      readStatus: async () => {
        throw new Error("timeout");
      },
    },
    started,
  );
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      await missionFanout.running(
        CALLER,
        new MemoryVfs(),
        started + 24 * 3600_000,
      ),
    ).toBe(0);
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("timeout"),
      expect.any(Error),
    );
  } finally {
    report.mockRestore();
  }
});

test.each([502, 504])(
  "HTTP %i is a transient remote status failure",
  async (status) => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: "unavailable" }, { status }),
    );
    await expect(
      readRemoteMissionStatus(
        {
          target: {
            remote: true,
            id: "target",
            name: "Target",
            workspace: "Space",
            workspaceId: "ws",
          },
          gateway: { url: "https://gateway.test", token: "token" },
          fetchImpl: fetchImpl as typeof fetch,
        },
        "m-r",
      ),
    ).rejects.toThrow(String(status));
  },
);

test("remote checks are cached between counts", async () => {
  const vfs = new MemoryVfs();
  const started = Date.now();
  let checks = 0;
  missionFanout.record(
    CALLER,
    {
      missionId: "m-r",
      boardRoot: null,
      readStatus: async () => {
        checks++;
        return "running";
      },
    },
    started,
  );
  expect(await missionFanout.running(CALLER, vfs, started + 2 * 3600_000)).toBe(
    1,
  );
  expect(
    await missionFanout.running(CALLER, vfs, started + 2 * 3600_000 + 1_000),
  ).toBe(1);
  expect(checks).toBe(1);
});

test("remote checks use the current turn's acting identity", async () => {
  const started = Date.now() - 2 * 3600_000;
  let seen: string | undefined;
  missionFanout.record(
    CALLER,
    {
      missionId: "m-r",
      boardRoot: null,
      readStatus: async (actingAs) => {
        seen = actingAs;
        return "settled";
      },
    },
    started,
  );
  expect(
    await missionFanout.running(
      CALLER,
      new MemoryVfs(),
      Date.now(),
      "current-turn-token",
    ),
  ).toBe(0);
  expect(seen).toBe("current-turn-token");
});

test("a reserved slot can be given back when the start failed", async () => {
  const vfs = new MemoryVfs();
  for (let i = 0; i < MAX_AGENT_STARTED_MISSIONS; i++) {
    expect(await missionFanout.reserve(CALLER, vfs)).toBe(true);
  }
  expect(await missionFanout.reserve(CALLER, vfs)).toBe(false);
  await missionFanout.releaseReservation(CALLER);
  expect(await missionFanout.reserve(CALLER, vfs)).toBe(true);
});

test("the budget counts starts spread over MANY boards", async () => {
  const vfs = new MemoryVfs();
  for (let i = 0; i < MAX_AGENT_STARTED_MISSIONS; i++) {
    const root = `${ROOT}-${i}`;
    await saveActivities(vfs, root, [row(`m-${i}`, "running")]);
    missionFanout.record(CALLER, { missionId: `m-${i}`, boardRoot: root });
  }
  // Not one board holds more than a single mission, and the caller is full.
  expect(await missionFanout.running(CALLER, vfs)).toBe(
    MAX_AGENT_STARTED_MISSIONS,
  );
});

test("agents keep their own budgets", async () => {
  missionFanout.record(CALLER, { missionId: "m-r", boardRoot: null });
  expect(await missionFanout.running("ws/Other", new MemoryVfs())).toBe(0);
});

test("an older running mission is read by id beyond the newest 100 rows", async () => {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/missions"))
      return Response.json({
        missions: Array.from({ length: 100 }, (_, i) => ({
          id: `new-${i}`,
          status: "done",
        })),
      });
    if (url.endsWith("/missions/read?id=old"))
      return Response.json({ id: "old", status: "running", messages: [] });
    throw new Error(`unexpected URL ${url}`);
  });
  const status = await readRemoteMissionStatus(
    {
      target: {
        remote: true,
        id: "target",
        name: "Target",
        workspace: "Space",
        workspaceId: "ws",
      },
      gateway: { url: "https://gateway.test", token: "token" },
      fetchImpl: fetchImpl as typeof fetch,
    },
    "old",
  );
  expect(status).toBe("running");
  expect(fetchImpl).toHaveBeenCalledWith(
    expect.stringContaining("/missions/read?id=old"),
    expect.any(Object),
  );
});

test("a slow remote refresh does not hold the reservation lock", async () => {
  const vfs = new MemoryVfs();
  let begin: (() => void) | undefined;
  let release: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const blocked = new Promise<"running">((resolve) => {
    release = () => resolve("running");
  });
  missionFanout.record(
    CALLER,
    {
      missionId: "old",
      boardRoot: null,
      readStatus: async () => {
        begin?.();
        return blocked;
      },
    },
    Date.now() - 2 * 3600_000,
  );
  const first = missionFanout.reserve(CALLER, vfs);
  await started;
  const second = missionFanout.reserve(CALLER, vfs);
  try {
    expect(
      await Promise.race([
        second.then(() => "reserved"),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("blocked"), 100),
        ),
      ]),
    ).toBe("reserved");
  } finally {
    release?.();
    await first;
    await second;
  }
});
