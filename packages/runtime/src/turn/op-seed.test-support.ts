import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
  StoreConflictError,
  type WriteOptions,
} from "@houston/runtime-client/object-sync";
import type { SeedOp } from "./op-grammar-seed";
import type { OpRequest } from "./parse-op-request";

export const PREFIX = "ws/acme/ledger";

export interface Upload {
  key: string;
  ifGenerationMatch?: string;
}

export function generationStore() {
  const root = mkdtempSync(join(tmpdir(), "op-seed-store-"));
  const inner = new LocalDirStore(root);
  const uploads: Upload[] = [];
  const deletes: string[] = [];
  const downloads: string[] = [];
  const hooks: { beforeUpload?: (key: string) => void } = {};
  const generations = new Map<string, number>();
  const generationOf = (key: string) =>
    existsSync(join(root, key)) ? String(generations.get(key) ?? 1) : "0";
  const cas = (key: string, opts?: WriteOptions) => {
    const want = opts?.ifGenerationMatch;
    if (want !== undefined && want !== generationOf(key))
      throw new StoreConflictError(key, `412 on ${key}`);
  };
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: async (p) =>
      (await inner.manifest(p)).map((o) => ({
        ...o,
        generation: generationOf(o.key),
      })),
    download: (key, dest) => {
      downloads.push(key.slice(PREFIX.length + 1));
      return inner.download(key, dest);
    },
    upload: async (src, key, opts?: WriteOptions) => {
      hooks.beforeUpload?.(key);
      cas(key, opts);
      uploads.push({ key, ifGenerationMatch: opts?.ifGenerationMatch });
      await inner.upload(src, key);
      const next = Number(generationOf(key)) + 1;
      generations.set(key, next);
      return { generation: String(next) };
    },
    delete: async (key, opts) => {
      cas(key, opts);
      deletes.push(key);
      await inner.delete(key, opts);
      generations.delete(key);
    },
  };
  const put = (rel: string, content: string) => {
    const file = join(root, PREFIX, ...rel.split("/"));
    const key = `${PREFIX}/${rel}`;
    const next = Number(generationOf(key)) + 1;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    generations.set(key, next);
  };
  const keys = async () =>
    (await inner.list(PREFIX)).map((k) => k.slice(PREFIX.length + 1));
  const read = (rel: string) =>
    readFileSync(join(root, PREFIX, ...rel.split("/")), "utf8");
  return { store, uploads, deletes, downloads, hooks, put, keys, read };
}

export interface DocPut {
  family: string;
  doc: unknown;
  headers: Headers;
}

export function docRoute(
  status: number | "throw" = 200,
  existing: string[] = [],
) {
  const puts: DocPut[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const family = String(url).split("/").pop() ?? "";
    if (!init?.method || init.method === "GET")
      return existing.includes(family)
        ? Response.json({ doc: [], revision: 3 }, { status: 200 })
        : Response.json({ error: "document not found" }, { status: 404 });
    if (status === "throw") throw new TypeError("fetch failed");
    puts.push({
      family: String(url).split("/").pop() ?? "",
      doc: (JSON.parse(String(init.body)) as { doc: unknown }).doc,
      headers: new Headers(init.headers),
    });
    return Response.json({ revision: 1 }, { status: status });
  }) as typeof fetch;
  return {
    puts,
    deps: {
      poolStoreUrl: "https://store.example",
      fetchImpl,
      activityDocRetryDelaysMs: [],
    },
  };
}

export function seedRequest(
  op: Omit<SeedOp, "kind">,
  actingAs?: OpRequest["actingAs"],
): OpRequest & { op: SeedOp } {
  return {
    workspaceId: "acme",
    agentId: "ledger",
    gcsPrefix: PREFIX,
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl: "https://x/hb",
    },
    ...(actingAs ? { actingAs } : {}),
    credential: null,
    triggersEnabled: false,
    op: { kind: "seed", ...op },
  };
}
