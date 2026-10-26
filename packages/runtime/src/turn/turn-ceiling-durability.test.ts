import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import * as conversations from "../store/conversation-file";
import { realCeiling } from "./ceiling-real.test-support";
import * as durability from "./turn-durability";

vi.mock("./turn-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./turn-runtime")>()),
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "openai-codex", id: "test", contextWindow: 128000 },
  }),
}));
afterEach(() => vi.restoreAllMocks());

test.each([
  413, 412,
])("an upload refused with %s makes the live terminal and worker row unsaved", async (status) => {
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) =>
      init?.method === "PUT" && url.endsWith("/result.txt")
        ? new Response("refused", { status })
        : undefined,
  });
  try {
    const terminal = frames.find((f) => f.type === "error");
    expect(terminal).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null").message.stopReason).toBe(
      "turn_time_limit_unsaved",
    );
    const conversationKey = (await pool.keys()).find((key) =>
      key.endsWith("/conversations/c.json"),
    );
    expect(
      JSON.parse(pool.read(conversationKey ?? "missing")).messages.at(-1)
        .stopReason,
    ).toBe("turn_time_limit_unsaved");
    expect(terminal).toMatchObject({
      data: { syncIncomplete: expect.any(Object) },
    });
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test.each([
  "sync",
  "transcript",
  "absent",
])("a %s failure ends the real runTurn with an unsaved terminal", async (failure) => {
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (init?.method !== "PUT") return;
      if (failure === "sync" && url.endsWith("/result.txt"))
        return new Response("failed", { status: 400 });
      if (failure !== "sync" && url.includes("/transcripts/"))
        return new Response("failed", {
          status: failure === "absent" ? 404 : 400,
        });
    },
  });
  try {
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ code: "turn_time_limit_unsaved" }),
      }),
    ]);
    expect(
      pool.transcripts.some((call) => call.path.endsWith("/assistant")),
    ).toBe(false);
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("a marker write failure never publishes an assistant row with a different stop reason", async () => {
  const original = conversations.saveConversation;
  vi.spyOn(conversations, "saveConversation").mockImplementation(
    (dir, conversation) => {
      if (conversation.messages.some((m) => m.stopReason))
        throw new Error("marker unavailable");
      return original(dir, conversation);
    },
  );
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const { frames, pool } = await realCeiling();
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    expect(
      pool.transcripts.some((call) => call.path.endsWith("/assistant")),
    ).toBe(false);
    expect(errors).toHaveBeenCalledWith(
      "[turn] wind-down marker failed",
      expect.any(Error),
    );
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test.each([
  "board",
  "family",
  "afterSync",
])("a %s failure keeps the saved terminal and published reason after real runTurn", async (failure) => {
  const original = durability.finishTurnDurability;
  if (failure === "afterSync")
    vi.spyOn(durability, "finishTurnDurability").mockImplementation((opts) =>
      original({ ...opts, afterSync: async () => "routine afterSync failed" }),
    );
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const { frames, pool } = await realCeiling({
    writeWorkspace: (dir) => {
      mkdirSync(join(dir, ".houston/activity"), { recursive: true });
      writeFileSync(join(dir, ".houston/activity/activity.json"), "[]");
      mkdirSync(join(dir, ".houston/learnings"), { recursive: true });
      writeFileSync(join(dir, ".houston/learnings/learnings.json"), "[]");
    },
    intercept: async (url, init) =>
      init?.method === "PUT" &&
      url.includes("/docs/") &&
      url.endsWith(failure === "board" ? "/activity" : "/learnings")
        ? new Response("failed", { status: 400 })
        : undefined,
  });
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit" },
    });
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null").message.stopReason).toBe(
      "turn_time_limit",
    );
    expect(errors).toHaveBeenCalledWith(
      "[turn] wind-down durability failed",
      expect.stringContaining(
        failure === "board"
          ? "board doc publish failed"
          : failure === "family"
            ? "learnings doc publish failed"
            : "routine afterSync failed",
      ),
    );
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test.each([
  "rejected",
  "throws",
])("an assistant publication that %s leaves the live terminal and object marker unsaved", async (failure) => {
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (
        init?.method !== "PUT" ||
        !url.includes("/transcripts/") ||
        !url.endsWith("/assistant")
      )
        return;
      if (failure === "throws") throw new Error("transcript unavailable");
      return new Response("rejected", { status: 400 });
    },
  });
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    expect(pool.transcripts.map((call) => call.path.split("/").at(-1))).toEqual(
      ["user"],
    );
    const key = (await pool.keys()).find((key) =>
      key.endsWith("/conversations/c.json"),
    );
    expect(
      JSON.parse(pool.read(key ?? "missing")).messages.at(-1).stopReason,
    ).toBe("turn_time_limit_unsaved");
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("an unsaved marker that cannot sync still publishes its locally saved worker row", async () => {
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) =>
      init?.method === "PUT" &&
      (url.endsWith("/result.txt") || url.endsWith("/conversations/c.json"))
        ? new Response("too large", { status: 413 })
        : undefined,
  });
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null")?.message.stopReason).toBe(
      "turn_time_limit_unsaved",
    );
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("a fence during the unsaved marker correction still ends as claim_fenced", async () => {
  let conversationWrites = 0;
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (init?.method !== "PUT") return;
      if (url.endsWith("/result.txt"))
        return new Response("too large", { status: 413 });
      if (url.endsWith("/conversations/c.json") && ++conversationWrites > 1)
        return new Response("fenced", { status: 409 });
    },
  });
  try {
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ message: "claim_fenced" }),
      }),
    ]);
    expect(
      pool.transcripts.some((call) => call.path.endsWith("/assistant")),
    ).toBe(false);
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("a sync exception after the conversation lands corrects both markers using the current object generation", async () => {
  const save = conversations.saveConversation;
  const localMarkers: string[] = [];
  vi.spyOn(conversations, "saveConversation").mockImplementation(
    (dir, conversation) => {
      save(dir, conversation);
      const marker = conversations
        .loadConversation(dir, conversation.id)
        ?.messages.at(-1)?.stopReason;
      if (marker) localMarkers.push(marker);
    },
  );
  let conversationLanded = false;
  let correctionGeneration: string | null = null;
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (url.includes("/manifest") && conversationLanded) {
        return Response.json({
          objects: [
            {
              key: "workspaces/W/A/.houston/runtime/conversations/c.json",
              size: 1,
              md5: "current",
              updated: new Date().toISOString(),
              gen: "7",
            },
          ],
        });
      }
      if (init?.method !== "PUT") return;
      if (url.endsWith("/conversations/c.json")) {
        if (conversationLanded) {
          correctionGeneration = new Headers(init.headers).get(
            "X-Houston-If-Generation-Match",
          );
          if (correctionGeneration !== "7")
            return new Response("stale", { status: 412 });
        }
        conversationLanded = true;
      }
      if (url.endsWith("/result.txt")) {
        expect(conversationLanded).toBe(true);
        return new Response("failed", { status: 400 });
      }
    },
  });
  try {
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ code: "turn_time_limit_unsaved" }),
      }),
    ]);
    const key = (await pool.keys()).find((key) =>
      key.endsWith("/conversations/c.json"),
    );
    expect(
      JSON.parse(pool.read(key ?? "missing")).messages.at(-1).stopReason,
    ).toBe("turn_time_limit_unsaved");
    expect(localMarkers.at(-1)).toBe("turn_time_limit_unsaved");
    expect(correctionGeneration).toBe("7");
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test.each([
  400, 413, 412,
])("an object-only marker correction failure %s preserves the unsaved assistant row", async (status) => {
  let conversationWrites = 0;
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (init?.method !== "PUT") return;
      if (url.endsWith("/result.txt"))
        return new Response("too large", { status: 413 });
      if (url.endsWith("/conversations/c.json") && ++conversationWrites > 1)
        return new Response("refused", { status });
    },
  });
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null")?.message.stopReason).toBe(
      "turn_time_limit_unsaved",
    );
    expect(conversationWrites).toBe(2);
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("a local unsaved marker correction failure still suppresses the assistant row", async () => {
  const save = conversations.saveConversation;
  vi.spyOn(conversations, "saveConversation").mockImplementation(
    (dir, conversation) => {
      if (
        conversation.messages.some(
          (message) => message.stopReason === "turn_time_limit_unsaved",
        )
      )
        throw new Error("local correction unavailable");
      save(dir, conversation);
    },
  );
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) =>
      init?.method === "PUT" && url.endsWith("/result.txt")
        ? new Response("too large", { status: 413 })
        : undefined,
  });
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    expect(
      pool.transcripts.some((call) => call.path.endsWith("/assistant")),
    ).toBe(false);
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("a sync exception before the conversation lands creates its unsaved object", async () => {
  let conversationWrites = 0;
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (
        init?.method === "PUT" &&
        url.endsWith("/conversations/c.json") &&
        ++conversationWrites === 1
      )
        return new Response("failed", { status: 400 });
    },
  });
  try {
    expect(frames.find((f) => f.type === "error")).toMatchObject({
      data: { code: "turn_time_limit_unsaved" },
    });
    const key = (await pool.keys()).find((key) =>
      key.endsWith("/conversations/c.json"),
    );
    expect(
      JSON.parse(pool.read(key ?? "missing")).messages.at(-1).stopReason,
    ).toBe("turn_time_limit_unsaved");
    expect(conversationWrites).toBe(2);
    expect(
      pool.writes.find((write) => write.key === key)?.ifGenerationMatch,
    ).toBe("0");
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test.each([
  "manifest",
  "upload",
])("a stalled marker %s correction aborts within its budget and ends unsaved", async (stage) => {
  let syncFailed = false;
  let aborted = false;
  const { frames, pool } = await realCeiling({
    intercept: async (url, init) => {
      if (init?.method === "PUT" && url.endsWith("/result.txt")) {
        syncFailed = true;
        return new Response("failed", { status: 400 });
      }
      if (!syncFailed) return;
      const target =
        stage === "manifest"
          ? url.includes("/manifest")
          : init?.method === "PUT" && url.endsWith("/conversations/c.json");
      if (!target) return;
      const signal = init?.signal;
      expect(signal).toBeTruthy();
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
  });
  try {
    expect(aborted).toBe(true);
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ code: "turn_time_limit_unsaved" }),
      }),
    ]);
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});
