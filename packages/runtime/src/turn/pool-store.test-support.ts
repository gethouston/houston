import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";

/**
 * The gateway's pod-store as a `fetchImpl`: the object routes a claimed
 * worker reads and writes (`/v1/pod/store/<org>/<agent>/...`, create-only
 * CAS included), the doc route (revisioned, If-Match enforced), the
 * custom-secret custody route, the transcript routes and the claim
 * heartbeat. Every store write, doc PUT and transcript call is recorded with
 * the claim it carried.
 */

export const POOL_STORE_URL = "https://store.example";
export const HEARTBEAT_URL = `${POOL_STORE_URL}/hb`;

export interface StoreWrite {
  method: string;
  key: string;
  claim: string | null;
  ifGenerationMatch: string | null;
}

export interface TranscriptCall {
  method: string;
  path: string;
  headers: Headers;
  body: string;
}

export interface DocPut {
  family: string;
  doc: unknown;
  claim: string | null;
}

export function fakePoolStore(prefix: string, transcriptStatus = 200) {
  const root = mkdtempSync(join(tmpdir(), "pool-store-"));
  const fileOf = (key: string) => join(root, prefix, ...key.split("/"));
  const writes: StoreWrite[] = [];
  const transcripts: TranscriptCall[] = [];
  const docs = new Map<string, { doc: unknown; revision: number }>();
  const docPuts: DocPut[] = [];
  const secrets = new Map<string, string>();
  const meta = (key: string) => {
    const bytes = readFileSync(fileOf(key));
    return {
      key,
      size: bytes.length,
      md5: createHash("md5").update(bytes).digest("base64"),
      updated: statSync(fileOf(key)).mtime.toISOString(),
      gen: "1",
    };
  };
  const storeRoute = async (
    method: string,
    rest: string,
    init?: RequestInit,
    query = new URLSearchParams(),
  ) => {
    const headers = new Headers(init?.headers);
    if (rest === "manifest") {
      // Keys relative to the agent root, `?prefix=` a directory, and
      // `?delimiter=/` one level of it, as pod-store answers.
      const agent = new LocalDirStore(join(root, prefix));
      const dir = query.get("prefix") ?? "";
      if (query.get("delimiter") === "/") {
        const level = await agent.manifestDir(dir);
        return Response.json({
          objects: level.objects.map(({ key }) => meta(key)),
          dirs: level.dirs,
        });
      }
      const keys = await agent.list(dir);
      return Response.json({ objects: keys.map(meta) });
    }
    if (!rest.startsWith("objects/")) return new Response("", { status: 404 });
    const key = rest
      .slice("objects/".length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    if (method === "GET") {
      if (!existsSync(fileOf(key))) return new Response("", { status: 404 });
      return new Response(readFileSync(fileOf(key)), {
        headers: { "X-Houston-Generation": "1" },
      });
    }
    const write = {
      method,
      key,
      claim: headers.get("X-Houston-Claim-Conversation"),
      ifGenerationMatch: headers.get("X-Houston-If-Generation-Match"),
    };
    if (method === "DELETE") {
      writes.push(write);
      rmSync(fileOf(key), { force: true });
      return new Response(null, { status: 204 });
    }
    if (write.ifGenerationMatch === "0" && existsSync(fileOf(key)))
      return new Response("exists", { status: 412 });
    writes.push(write);
    mkdirSync(dirname(fileOf(key)), { recursive: true });
    writeFileSync(
      fileOf(key),
      Buffer.from(await new Response(init?.body).arrayBuffer()),
    );
    return Response.json({ ...meta(key), gen: "2" });
  };
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname === "/hb") return Response.json({});
    const store = /^\/v1\/pod\/store\/[^/]+\/[^/]+\/(.+)$/.exec(url.pathname);
    if (store?.[1]) return storeRoute(method, store[1], init, url.searchParams);
    if (url.pathname.startsWith("/v1/pod/docs/"))
      return docRoute(method, url.pathname, init);
    if (url.pathname.startsWith("/v1/pod/custom-secrets/"))
      return secretRoute(method, url.pathname, init);
    if (url.pathname.startsWith("/v1/pod/transcripts/")) {
      transcripts.push({
        method,
        path: url.pathname,
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return Response.json({ revision: 1 }, { status: transcriptStatus });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const docRoute = (method: string, path: string, init?: RequestInit) => {
    const family = path.split("/").pop() ?? "";
    const current = docs.get(family);
    if (method === "GET")
      return current
        ? Response.json(current, {
            headers: { ETag: `"${current.revision}"` },
          })
        : Response.json({ error: "document not found" }, { status: 404 });
    const headers = new Headers(init?.headers);
    const revision = current?.revision ?? 0;
    const ifMatch = headers.get("If-Match");
    if (ifMatch !== null && Number(ifMatch) !== revision)
      return Response.json({ revision }, { status: 409 });
    const { doc } = JSON.parse(String(init?.body)) as { doc: unknown };
    docPuts.push({
      family,
      doc,
      claim: headers.get("X-Houston-Claim-Conversation"),
    });
    docs.set(family, { doc, revision: revision + 1 });
    return Response.json({ revision: revision + 1 });
  };
  const secretRoute = (method: string, path: string, init?: RequestInit) => {
    const id = decodeURIComponent(path.split("/").pop() ?? "");
    if (method === "GET") {
      const value = secrets.get(id);
      return value === undefined
        ? Response.json({ error: "not found" }, { status: 404 })
        : Response.json({ value });
    }
    // POST creates (412 over a value), PUT sets: the gateway's custody route.
    if (method === "POST" || method === "PUT") {
      if (method === "POST" && secrets.has(id))
        return Response.json({ error: "secret exists" }, { status: 412 });
      secrets.set(
        id,
        (JSON.parse(String(init?.body)) as { value: string }).value,
      );
      return Response.json({});
    }
    return new Response("", { status: 405 });
  };
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(fileOf(rel)), { recursive: true });
    writeFileSync(fileOf(rel), content);
  };
  const keys = async () =>
    (await new LocalDirStore(root).list(prefix)).map((k) =>
      k.slice(prefix.length + 1),
    );
  const read = (rel: string) => readFileSync(fileOf(rel), "utf8");
  return {
    root,
    fetchImpl,
    writes,
    transcripts,
    docs,
    docPuts,
    secrets,
    put,
    keys,
    read,
  };
}
