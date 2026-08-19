import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  type StoredConversation,
} from "../store/conversation-file";
import { createTurnServer } from "./server";
import type { TurnServerDeps } from "./server-types";
import type { runPiTurn } from "./turn-session";

interface SeenRequest {
  body?: unknown;
  headers: Headers;
  method: string;
  url: string;
}

interface DocReply {
  status: number;
  revision?: number;
  detail?: string;
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

const encode = (value: unknown) =>
  new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  );

function seedStandingLayout(): Map<string, Uint8Array> {
  const conversation: StoredConversation = {
    id: "mission.1",
    title: "Roadmap",
    createdAt: 1,
    updatedAt: 2,
    messages: [],
  };
  return new Map([
    ["workspaces/Main/Helper/.houston/runtime/settings.json", encode("{}")],
    [
      "workspaces/Main/Helper/.houston/runtime/conversations/mission.1.json",
      encode(conversation),
    ],
  ]);
}

function poolFetch(
  objects: Map<string, Uint8Array>,
  seen: SeenRequest[],
  docReplies: DocReply[] = [],
): typeof fetch {
  let docRequest = 0;
  return async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    if (url.pathname === "/heartbeat") {
      return new Response(null, { status: 200 });
    }
    if (url.pathname.includes("/v1/pod/transcripts/")) {
      return new Response(null, { status: 200 });
    }
    if (url.pathname.includes("/v1/pod/docs/")) {
      seen.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers,
        method: init?.method ?? "GET",
        url: String(input),
      });
      const reply = docReplies[docRequest++];
      if (reply) {
        if (reply.detail !== undefined) {
          return new Response(reply.detail, { status: reply.status });
        }
        return Response.json(
          reply.revision === undefined ? {} : { revision: reply.revision },
          { status: reply.status },
        );
      }
      return init?.method === "PUT"
        ? Response.json({ revision: 5 })
        : Response.json({ revision: 4 });
    }
    if (url.pathname.endsWith("/manifest")) {
      return Response.json({
        objects: [...objects].map(([key, bytes]) => ({
          key,
          size: bytes.byteLength,
          md5: "test",
          updated: "2026-08-19T00:00:00Z",
        })),
      });
    }
    const marker = "/objects/";
    const key = url.pathname
      .slice(url.pathname.indexOf(marker) + marker.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    if (init?.method === "PUT") {
      const bytes = new Uint8Array(init.body as Uint8Array);
      objects.set(key, bytes);
      seen.push({ headers, method: "PUT", url: String(input) });
      return Response.json({
        key,
        size: bytes.byteLength,
        md5: "test",
        updated: "2026-08-19T00:00:00Z",
      });
    }
    const bytes = objects.get(key);
    return bytes
      ? new Response(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        )
      : new Response("missing", { status: 404 });
  };
}

function turnBody(extra: Record<string, unknown> = {}) {
  return {
    workspaceId: "acme.org",
    agentId: "helper.bot",
    conversationId: "mission.1",
    text: "Build the launch plan",
    gcsPrefix: "ws/acme.org/helper.bot",
    credential: {
      provider: "openai-codex",
      access: "access-token",
      expires: Date.now() + 60_000,
    },
    turnId: "turn.7",
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl: "https://pool.example/heartbeat",
    },
    ...extra,
  };
}

async function runTurnRequest(
  deps: Partial<TurnServerDeps>,
  body = turnBody(),
): Promise<string> {
  const server = createTurnServer({
    store: new LocalDirStore(mkdtempSync(join(tmpdir(), "fallback-store-"))),
    token: "",
    transcriptRetryDelaysMs: [0, 0],
    activityDocRetryDelaysMs: [0, 0],
    ...deps,
  });
  const response = await fetch(`${await listen(server)}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.text();
}

function writeConversation(filesystem: Parameters<typeof runPiTurn>[0]): void {
  const dir = join(filesystem.dataDir, "conversations");
  appendUserMessageAt(dir, "mission.1", "Build the launch plan", {
    turnId: "turn.7",
  });
  appendAssistantMessageAt(dir, "mission.1", "Launch plan ready", {
    turnId: "turn.7",
  });
}

function writeActivity(
  filesystem: Parameters<typeof runPiTurn>[0],
  value: unknown,
): void {
  const path = join(
    filesystem.workspaceDir,
    ".houston",
    "activity",
    "activity.json",
  );
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

test("a claimed activity write syncs its object and normalized database doc", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const activity = [{ id: "a1", title: "Launch", status: "running" }];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    writeActivity(filesystem, activity);
    return {};
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example/",
    fetchImpl: poolFetch(objects, seen),
    heartbeatIntervalMs: 60_000,
  });

  const objectKey = "workspaces/Main/Helper/.houston/activity/activity.json";
  expect(JSON.parse(new TextDecoder().decode(objects.get(objectKey)))).toEqual(
    activity,
  );
  const docs = seen.filter(({ url }) => url.includes("/v1/pod/docs/"));
  expect(docs.map(({ method, url }) => ({ method, url }))).toEqual([
    {
      method: "GET",
      url: "https://pool.example/v1/pod/docs/acme.org/helper.bot/activity",
    },
    {
      method: "PUT",
      url: "https://pool.example/v1/pod/docs/acme.org/helper.bot/activity",
    },
  ]);
  for (const request of docs) {
    expect(request.headers.get("authorization")).toBe("Bearer host-token");
    expect(request.headers.get("x-houston-claim-token")).toBe("claim-token");
    expect(request.headers.get("x-houston-claim-boot")).toBe("boot-1");
    expect(request.headers.get("x-houston-claim-conversation")).toBe(
      "mission.1",
    );
  }
  expect(docs[1]?.headers.get("if-match")).toBe("4");
  expect(docs[1]?.body).toEqual({
    doc: [{ description: "", ...activity[0] }],
  });
  const activityUpload = seen.find(({ url }) => url.endsWith(objectKey));
  expect(activityUpload?.headers.get("x-houston-claim-conversation")).toBe(
    "mission.1",
  );
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("an activity doc conflict retries once with the returned revision", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    writeActivity(filesystem, [
      { id: "a1", title: "Launch", status: "running" },
    ]);
    return {};
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, seen, [
      { status: 200, revision: 4 },
      { status: 409, revision: 9 },
      { status: 200, revision: 10 },
    ]),
    heartbeatIntervalMs: 60_000,
  });

  const docs = seen.filter(({ url }) => url.includes("/v1/pod/docs/"));
  expect(docs.map(({ method }) => method)).toEqual(["GET", "PUT", "PUT"]);
  expect(docs[1]?.headers.get("if-match")).toBe("4");
  expect(docs[2]?.headers.get("if-match")).toBe("9");
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("malformed activity entries are dropped without failing the turn", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    writeActivity(filesystem, [
      null,
      { title: "Missing identity" },
      { id: "a1", title: "Launch", status: "running" },
    ]);
    return {};
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, seen),
    heartbeatIntervalMs: 60_000,
  });

  const put = seen.find(
    ({ method, url }) => method === "PUT" && url.includes("/v1/pod/docs/"),
  );
  expect(put?.body).toEqual({
    doc: [{ id: "a1", title: "Launch", status: "running", description: "" }],
  });
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("an activity doc PUT 404 reports route skew without failing the turn", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    writeActivity(filesystem, [
      { id: "a1", title: "Launch", status: "running" },
    ]);
    return {};
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, seen, [
      { status: 200, revision: 4 },
      { status: 404 },
    ]),
    heartbeatIntervalMs: 60_000,
  });

  expect(seen.filter(({ url }) => url.includes("/v1/pod/docs/"))).toHaveLength(
    2,
  );
  expect(raw).toContain('"type":"done"');
  expect(raw).toContain('"activityDocSkipped":"route_absent"');
  expect(raw).not.toContain('"type":"error"');
});

test("a persistent activity doc 503 becomes a status-only turn error", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    writeActivity(filesystem, [
      { id: "a1", title: "Launch", status: "running" },
    ]);
    return { error: "provider failed" };
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, seen, [
      { status: 200, revision: 4 },
      { status: 503, detail: "upstream database unavailable" },
      { status: 503, detail: "upstream database unavailable" },
      { status: 503, detail: "upstream database unavailable" },
    ]),
    heartbeatIntervalMs: 60_000,
  });

  expect(seen.filter(({ url }) => url.includes("/v1/pod/docs/"))).toHaveLength(
    4,
  );
  expect(raw).toContain('"type":"error"');
  expect(raw).toContain(
    "provider failed; board doc publish failed: PUT rejected (503)",
  );
  expect(raw).not.toContain("upstream database unavailable");
  expect(raw).not.toContain('"type":"done"');
});

test("a claimed turn that does not touch activity makes no doc requests", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    return {};
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, seen),
    heartbeatIntervalMs: 60_000,
  });

  expect(seen.some(({ url }) => url.includes("/v1/pod/docs/"))).toBe(false);
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("an unclaimed turn keeps full sync and makes no doc requests", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "standing-store-"));
  const prefixRoot = join(storeRoot, "ws", "acme.org", "helper.bot");
  const settings = join(
    prefixRoot,
    "workspaces",
    "Main",
    "Helper",
    ".houston",
    "runtime",
    "settings.json",
  );
  mkdirSync(join(settings, ".."), { recursive: true });
  writeFileSync(settings, "{}");
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeActivity(filesystem, [
      { id: "a1", title: "Launch", status: "running" },
    ]);
    writeFileSync(join(filesystem.workspaceDir, "result.txt"), "complete");
    return {};
  };

  const raw = await runTurnRequest(
    {
      store: new LocalDirStore(storeRoot),
      runTurn,
      poolStoreUrl: "https://pool.example",
      fetchImpl: poolFetch(new Map(), seen),
    },
    turnBody({ claim: undefined, hostToken: undefined }),
  );

  expect(
    readFileSync(
      join(
        prefixRoot,
        "workspaces/Main/Helper/.houston/activity/activity.json",
      ),
      "utf8",
    ),
  ).toContain('"id":"a1"');
  expect(
    readFileSync(join(prefixRoot, "workspaces/Main/Helper/result.txt"), "utf8"),
  ).toBe("complete");
  expect(seen.some(({ url }) => url.includes("/v1/pod/docs/"))).toBe(false);
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("a shadow turn makes no activity doc requests", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];

  const raw = await runTurnRequest(
    {
      runTurn: async () => {
        throw new Error("shadow must not run the turn session");
      },
      poolStoreUrl: "https://pool.example",
      fetchImpl: poolFetch(objects, seen),
      heartbeatIntervalMs: 60_000,
    },
    turnBody({ shadow: true }),
  );

  expect(seen.some(({ url }) => url.includes("/v1/pod/docs/"))).toBe(false);
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("an absent activity doc seeds revision zero before PUT", async () => {
  const objects = seedStandingLayout();
  const seen: SeenRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem) => {
    writeConversation(filesystem);
    writeActivity(filesystem, [
      { id: "a1", title: "Launch", status: "running" },
    ]);
    return {};
  };

  const raw = await runTurnRequest({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, seen, [
      { status: 404 },
      { status: 200, revision: 1 },
    ]),
    heartbeatIntervalMs: 60_000,
  });

  const docs = seen.filter(({ url }) => url.includes("/v1/pod/docs/"));
  expect(docs.map(({ method }) => method)).toEqual(["GET", "PUT"]);
  expect(docs[1]?.headers.get("if-match")).toBe("0");
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"activityDocSkipped"');
  expect(raw).not.toContain('"type":"error"');
});
