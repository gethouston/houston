import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { landHttpBatch } from "./http-store-batch";
import { hydrate, syncBack } from "./hydrate";
import { ObjectAttrsRefusedError } from "./object-store-errors";
import {
  PrefetchedObjectStore,
  parsePrefetchedObjects,
} from "./prefetched-store";

const key = "workspaces/Personal/Bob/web/node_modules/.bin/tsc";
const body = (k: string) => ({
  key: k,
  size: 1,
  md5: "m",
  updated: "2026-11-22T00:00:00Z",
  gen: 9,
});

function recording(answer: (init: RequestInit, url: URL) => Response) {
  const requests: { url: URL; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    return answer(init, url);
  };
  const store = new HttpObjectStore({
    baseUrl: "https://store.test",
    token: "t",
    retryDelaysMs: [],
    fetchImpl,
  });
  return { store, requests };
}

const listing = (links?: unknown[]) =>
  Response.json({ objects: [], ...(links ? { links } : {}) });

test("the manifest says whether the store keeps links", async () => {
  const withLinks = recording(() => listing([]));
  expect(withLinks.store.fileAttrs).toBeUndefined();
  await withLinks.store.manifest("");
  expect(withLinks.store.fileAttrs).toBe(true);
  const older = recording(() => listing());
  await older.store.manifest("");
  expect(older.store.fileAttrs).toBe(false);
  const rolling = recording((_init, url) =>
    url.searchParams.has("prefix") ? listing() : listing([]),
  );
  await rolling.store.manifest("");
  await rolling.store.manifest("a");
  expect(rolling.store.fileAttrs).toBe(true);
});

test("a link uploads its target with the link header", async () => {
  const dir = await mkdtemp(join(tmpdir(), "http-attrs-"));
  await symlink("../typescript/bin/tsc", join(dir, "tsc"));
  const { store, requests } = recording((_init, url) =>
    url.pathname.endsWith("/manifest")
      ? listing([])
      : Response.json(body(key), { headers: { "X-Houston-Object-Link": "1" } }),
  );
  await store.manifest("");
  expect(
    await store.upload(join(dir, "tsc"), key, { ifGenerationMatch: "0" }),
  ).toEqual({ generation: "9" });
  const put = requests[1];
  expect(
    (put?.init.headers as Record<string, string>)["X-Houston-Object-Link"],
  ).toBe("1");
  expect(Buffer.from(put?.init.body as Buffer).toString()).toBe(
    "../typescript/bin/tsc",
  );
});

test("a link the store wrote as a plain file is removed again", async () => {
  const dir = await mkdtemp(join(tmpdir(), "http-attrs-"));
  await symlink("x", join(dir, "tsc"));
  const { store, requests } = recording((init, url) => {
    if (url.pathname.endsWith("/manifest")) return listing([]);
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json(body(key));
  });
  await store.manifest("");
  await expect(store.upload(join(dir, "tsc"), key)).rejects.toBeInstanceOf(
    ObjectAttrsRefusedError,
  );
  const remove = requests[2];
  expect(remove?.init.method).toBe("DELETE");
  expect(
    (remove?.init.headers as Record<string, string>)[
      "X-Houston-If-Generation-Match"
    ],
  ).toBe("9");
});

test("a plain copy that cannot be removed still skips only that link", async () => {
  const dir = await mkdtemp(join(tmpdir(), "http-attrs-"));
  await symlink("x", join(dir, "tsc"));
  const { store } = recording((init) =>
    init.method === "DELETE"
      ? Response.json({ error: "boom" }, { status: 500 })
      : Response.json(body(key)),
  );
  await expect(store.upload(join(dir, "tsc"), key)).rejects.toBeInstanceOf(
    ObjectAttrsRefusedError,
  );
});

test("a store that refuses a link PUT skips that one link", async () => {
  const dir = await mkdtemp(join(tmpdir(), "http-attrs-"));
  await symlink("x", join(dir, "tsc"));
  for (const status of [400, 501]) {
    const { store } = recording(() =>
      Response.json({ error: "refused" }, { status }),
    );
    await expect(store.upload(join(dir, "tsc"), key)).rejects.toBeInstanceOf(
      ObjectAttrsRefusedError,
    );
  }
});

test("a turn with a gateway prefetch uploads a new link and keeps syncing", async () => {
  const root = await mkdtemp(join(tmpdir(), "http-attrs-"));
  const agentDir = join(root, "workspaces", "Personal", "Bob", "bin");
  await mkdir(agentDir, { recursive: true });
  await symlink("run.sh", join(agentDir, "run"));
  await writeFile(join(agentDir, "run.sh"), "echo\n");
  const { store, requests } = recording((init, url) =>
    Response.json(
      body(decodeURIComponent(url.pathname.split("/objects/")[1] ?? "")),
      {
        headers:
          init.method === "PUT" &&
          (init.headers as Record<string, string>)["X-Houston-Object-Link"]
            ? { "X-Houston-Object-Link": "1" }
            : {},
      },
    ),
  );
  const prefetched = parsePrefetchedObjects({
    manifest: [],
    links: [],
    objects: {},
  });
  const turnStore = new PrefetchedObjectStore(
    store,
    prefetched ?? { manifest: [], objects: new Map() },
  );
  const manifest = await hydrate(turnStore, "", root);
  const result = await syncBack(turnStore, "", root, manifest, {
    generations: true,
    workerMerge: true,
  });
  expect(result.skipped).toEqual([]);
  expect(result.uploaded.sort()).toEqual([
    "workspaces/Personal/Bob/bin/run",
    "workspaces/Personal/Bob/bin/run.sh",
  ]);
  expect(requests.some(({ url }) => url.pathname.endsWith("/manifest"))).toBe(
    false,
  );
});

test("an executable file carries the executable header", async () => {
  const dir = await mkdtemp(join(tmpdir(), "http-attrs-"));
  await writeFile(join(dir, "run.sh"), "echo\n");
  await chmod(join(dir, "run.sh"), 0o755);
  await writeFile(join(dir, "notes.md"), "n\n");
  const { store, requests } = recording(() => Response.json(body("k")));
  await store.upload(join(dir, "run.sh"), "k");
  await store.upload(join(dir, "notes.md"), "k");
  const headers = requests.map(
    ({ init }) =>
      (init.headers as Record<string, string>)["X-Houston-Object-Executable"],
  );
  expect(headers).toEqual(["1", undefined]);
});

test("a GET of a link lands a symlink, or nothing when it leaves the agent folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "http-attrs-"));
  const { store } = recording(
    (_init, url) =>
      new Response(
        url.pathname.endsWith("tsc") ? "../typescript/bin/tsc" : "/etc/passwd",
        {
          headers: {
            "X-Houston-Object-Link": "1",
            "X-Houston-Generation": "4",
          },
        },
      ),
  );
  expect(await store.download(key, join(dir, "tsc"))).toEqual({
    generation: "4",
  });
  expect(await readlink(join(dir, "tsc"))).toBe("../typescript/bin/tsc");
  expect(
    await store.download("workspaces/Personal/Bob/out", join(dir, "out")),
  ).toEqual({ refused: true });
  await expect(lstat(join(dir, "out"))).rejects.toThrow();
});

test("a batched link frame falls back to a single read", async () => {
  const header = Buffer.from(
    JSON.stringify({ key, status: 200, size: 1, link: true }),
  );
  const frame = Buffer.concat([Buffer.alloc(4), header, Buffer.from("x")]);
  frame.writeUInt32BE(header.length, 0);
  const outcomes = await landHttpBatch(new Response(frame), [
    { key, destFile: join(tmpdir(), "never") },
  ]);
  expect(outcomes.get(key)).toEqual({ status: "fallback" });
});

test("a prefetch carries links only when the gateway sent them", async () => {
  const withLinks = parsePrefetchedObjects({
    manifest: [],
    links: [{ ...body(key), target: "../a" }],
    objects: {},
  });
  expect(withLinks?.fileAttrs).toBe(true);
  expect(withLinks?.manifest.map(({ link }) => link)).toEqual(["../a"]);
  const older = parsePrefetchedObjects({ manifest: [], objects: {} });
  expect(older?.fileAttrs).toBeUndefined();
  const { store } = recording(() => listing());
  expect(
    new PrefetchedObjectStore(
      store,
      withLinks ?? { manifest: [], objects: new Map() },
    ).fileAttrs,
  ).toBe(true);
});
