import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { LAST_AGENT_PREF } from "../src/engine-adapter/client/context";

/**
 * Migration wave C5 — byte-identical route parity for the agent's WORKSPACE
 * FILES, now delegated to `sdk.files`: the listing, the read, every
 * rearrangement, and the two uploads.
 *
 * `cp/attachments.ts` is gone and the mixin's own `cpFilesFetch` calls are gone
 * with it, so these assertions ARE the record of what those requests put on the
 * wire: same method, whole URL (the `?path=` query included, escaped character
 * by character — a path escaped one way deletes a different file than the
 * other), body bytes, and headers over the ONE shared gateway fetch. Each call
 * is exactly one request: these publish no SDK scope and never refetch.
 *
 * Two things deliberately did NOT move, and are pinned here too: the binary
 * reads still ride `cpFetch` (a `Blob` cannot cross the SDK's JSON boundary),
 * and the multi-batch upload loop still runs in the adapter (batching reads a
 * browser `File`'s size and frames one batch at a time, so a folder drop never
 * holds every file's base64 in memory at once).
 */

const BASE = "http://host";
const ORG = "abcdef0123456789"; // [a-f0-9]{16}

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

/** Answer every request with `make()`, recording what was asked. */
function stubFetch(make: () => Response) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    return make();
  }) as unknown as typeof fetch;
}

const json = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

/** A cloud client with `agentId` selected — what `saveAttachments` uploads into. */
const clientWithAgent = (agentId: string) => {
  const c = client();
  localStorage.setItem(LAST_AGENT_PREF, agentId);
  return c;
};

const webFile = (name: string, text: string, relPath?: string): File => {
  const file = new File([text], name);
  if (relPath)
    Object.defineProperty(file, "webkitRelativePath", { value: relPath });
  return file;
};

const ENTRY = {
  path: "notes.md",
  name: "notes.md",
  extension: "md",
  size: 12,
  is_directory: false,
};

/** The four headers every delegated call must still carry. */
function expectGatewayHeaders(call: Call) {
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
}

// ---- reads ----

test("listProjectFiles delegates a byte-identical single GET /agents/:id/files", async () => {
  stubFetch(() => json(200, [ENTRY]));
  const c = client();
  c.setActiveOrg(ORG);

  await expect(c.listProjectFiles("a1")).resolves.toEqual([ENTRY]);

  expect(calls).toHaveLength(1);
  const [get] = calls;
  expect(get.method).toBe("GET");
  expect(get.url).toBe(`${BASE}/agents/a1/files`);
  expect(get.body).toBeNull();
  expectGatewayHeaders(get);
});

test("listProjectFiles percent-encodes the agent id it splices", async () => {
  stubFetch(() => json(200, []));
  await client().listProjectFiles("Home/Ada");
  expect(calls[0].url).toBe(`${BASE}/agents/Home%2FAda/files`);
});

test("readProjectFile escapes the rel path into the ?path= query", async () => {
  stubFetch(() => json(200, { content: "hi", base64: false }));

  await expect(client().readProjectFile("a1", "sub dir/a&b.md")).resolves.toBe(
    "hi",
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(
    `${BASE}/agents/a1/files/read?path=sub%20dir%2Fa%26b.md`,
  );
});

test("readProjectFile still decodes a base64-framed file to its bytes", async () => {
  stubFetch(() => json(200, { content: "SGVsbG8=", base64: true }));
  await expect(client().readProjectFile("a1", "logo.png")).resolves.toBe(
    "Hello",
  );
});

// ---- writes ----

test("deleteFile delegates one DELETE carrying the path as a query", async () => {
  stubFetch(() => json(200));
  const c = client();
  c.setActiveOrg(ORG);

  await c.deleteFile("a1", "sub/old.md");

  expect(calls).toHaveLength(1);
  const [del] = calls;
  expect(del.method).toBe("DELETE");
  expect(del.url).toBe(`${BASE}/agents/a1/files?path=sub%2Fold.md`);
  expect(del.body).toBeNull();
  expectGatewayHeaders(del);
});

test("renameFile, createFolder and moveProjectFile keep their body bytes", async () => {
  stubFetch(() => json(200, { created: "notes" }));
  const c = client();
  c.setActiveOrg(ORG);

  await c.renameFile("a1", "old.md", "new.md");
  await expect(c.createFolder("a1", "notes")).resolves.toEqual({
    created: "notes",
  });
  await c.moveProjectFile("a1", "old.md", null);

  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
    `POST ${BASE}/agents/a1/files/rename`,
    `POST ${BASE}/agents/a1/files/folder`,
    `POST ${BASE}/agents/a1/files/move`,
  ]);
  expect(calls.map((call) => call.body)).toEqual([
    JSON.stringify({ path: "old.md", newName: "new.md" }),
    JSON.stringify({ path: "notes" }),
    JSON.stringify({ path: "old.md", toDir: null }),
  ]);
  for (const call of calls) expectGatewayHeaders(call);
});

// ---- uploads: the adapter frames and batches, the SDK sends ----

test("uploadProjectFiles posts one framed batch per request, folder paths intact", async () => {
  stubFetch(() => json(200));
  const c = client();
  c.setActiveOrg(ORG);

  await c.uploadProjectFiles(
    "a1",
    [webFile("a.txt", "a", "folder/a.txt"), webFile("b.txt", "b")],
    "docs",
  );

  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/a1/files/import`);
  expect(post.body).toBe(
    JSON.stringify({
      dir: "docs",
      files: [
        { name: "a.txt", contentBase64: "YQ==", relPath: "folder/a.txt" },
        { name: "b.txt", contentBase64: "Yg==" },
      ],
    }),
  );
  expectGatewayHeaders(post);
});

test("uploadProjectFiles sends the workspace root as an explicit null dir", async () => {
  stubFetch(() => json(200));
  await client().uploadProjectFiles("a1", [webFile("a.txt", "a")]);
  expect(JSON.parse(calls[0].body ?? "{}").dir).toBeNull();
});

test("uploadProjectFiles still batches: 26 files are two requests, not 26", async () => {
  stubFetch(() => json(200));
  const files = Array.from({ length: 26 }, (_, i) => webFile(`f${i}.txt`, "x"));

  await client().uploadProjectFiles("a1", files);

  expect(calls).toHaveLength(2);
  expect(JSON.parse(calls[0].body ?? "{}").files).toHaveLength(25);
  expect(JSON.parse(calls[1].body ?? "{}").files).toHaveLength(1);
});

test("uploadProjectFiles asks nothing when handed no files", async () => {
  stubFetch(() => json(200));
  await client().uploadProjectFiles("a1", []);
  expect(calls).toEqual([]);
});

test("saveAttachments posts the selected agent's attachments route", async () => {
  stubFetch(() => json(200, { paths: ["uploads/a.txt"] }));
  const c = clientWithAgent("a 1");
  c.setActiveOrg(ORG);

  await expect(
    c.saveAttachments("conv-1", [webFile("a.txt", "a", "folder/a.txt")]),
  ).resolves.toEqual(["uploads/a.txt"]);

  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/a%201/attachments`);
  expect(post.body).toBe(
    JSON.stringify({
      scopeId: "conv-1",
      files: [
        { name: "a.txt", contentBase64: "YQ==", relPath: "folder/a.txt" },
      ],
    }),
  );
  expectGatewayHeaders(post);
});

test("saveAttachments collects the paths of every batch it sends", async () => {
  let n = 0;
  stubFetch(() => json(200, { paths: [`uploads/${n++}.txt`] }));
  const files = Array.from({ length: 26 }, (_, i) => webFile(`f${i}.txt`, "x"));

  const paths = await clientWithAgent("a1").saveAttachments("conv-1", files);

  expect(calls).toHaveLength(2);
  expect(paths).toEqual(["uploads/0.txt", "uploads/1.txt"]);
});

// ---- what stayed in the adapter ----

test("the binary reads still ride cpFetch and answer a Blob", async () => {
  stubFetch(
    () =>
      new Response("zip", { headers: { "Content-Type": "application/zip" } }),
  );
  const c = client();
  c.setActiveOrg(ORG);

  const archive = await c.downloadProjectArchive("a1", "sub dir");
  expect(archive.contentType).toBe("application/zip");
  expect(archive.blob).toBeInstanceOf(Blob);

  const file = await c.downloadProjectFile("a1", "sub/a b.md");
  expect(file.blob).toBeInstanceOf(Blob);

  expect(calls.map((call) => call.url)).toEqual([
    `${BASE}/agents/a1/files/archive?path=sub%20dir`,
    `${BASE}/agents/a1/files/download?path=sub%2Fa%20b.md`,
  ]);
  for (const call of calls) expectGatewayHeaders(call);
});

// ---- degradations stay in the adapter, not in the SDK ----

test("off-cloud the workspace reads stay inert and ask nothing", async () => {
  stubFetch(() => json(200, []));
  const local = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: false,
  });

  await expect(local.listProjectFiles("a1")).resolves.toEqual([]);
  await expect(local.readProjectFile("a1", "x.md")).resolves.toBe("");
  await local.deleteFile("a1", "x.md");
  await expect(local.createFolder("a1", "notes")).resolves.toEqual({
    created: "notes",
  });

  expect(calls).toEqual([]);
});

test("a failed workspace call surfaces as the adapter's engine error", async () => {
  stubFetch(() => json(404, { error: "no such agent" }));

  await expect(client().listProjectFiles("a1")).rejects.toMatchObject({
    name: "HoustonEngineError",
    status: 404,
    agentId: "a1",
  });
});
