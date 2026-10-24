import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InvalidObjectPrefixError,
  isObjectPrefix,
  type ObjectMetadata,
  type ObjectStore,
  underObjectPrefix,
} from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  snapshotTurnSharedSkills,
  turnSharedSkillsStore,
} from "./turn-shared-skills";

// vitest 4 hands back the existing spy when a method is spied again, so calls would pile up across tests.
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A pooled turn's org-shared skills: read from the org's shared store prefix
 * (never a pod's disk), only the ones this agent enabled, into a snapshot
 * under the turn's own root that dies with the turn.
 */

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

function sharedStore(files: Record<string, string>) {
  const downloads: string[] = [];
  const store: ObjectStore = {
    list: async () => Object.keys(files),
    // Every store reads a prefix as a directory, and pod-store refuses one
    // that is not a clean key (`skills/` included).
    manifest: async (prefix = "") => {
      if (!isObjectPrefix(prefix)) throw new InvalidObjectPrefixError(prefix);
      return Object.keys(files)
        .filter((key) => underObjectPrefix(key, prefix))
        .map(
          (key): ObjectMetadata => ({
            key,
            size: files[key]?.length ?? 0,
            md5: "",
            updated: "",
          }),
        );
    },
    download: async (key, dest) => {
      downloads.push(key);
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, files[key] ?? "");
    },
    upload: async () => {
      throw new Error("a pooled turn never writes the shared prefix");
    },
    delete: async () => {
      throw new Error("a pooled turn never deletes from the shared prefix");
    },
  };
  return { store, downloads };
}

function workspaceEnabling(...slugs: string[]): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), "shared-skills-ws-"));
  const dir = join(workspaceDir, ".houston", "skills-manifest");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "skills-manifest.json"),
    JSON.stringify({ version: 1, enabled: slugs }),
  );
  return workspaceDir;
}

const snapshotDir = () => {
  const dir = join(mkdtempSync(join(tmpdir(), "shared-skills-root-")), "snap");
  mkdirSync(dir);
  return dir;
};

test("only the skills this agent enabled land in the turn's snapshot", async () => {
  const { store, downloads } = sharedStore({
    "skills/invoices/SKILL.md": "---\nname: invoices\n---\n",
    "skills/invoices/reference.md": "net 30",
    "skills/payroll/SKILL.md": "---\nname: payroll\n---\n",
  });
  const dest = snapshotDir();

  await snapshotTurnSharedSkills(store, dest, workspaceEnabling("invoices"));

  expect(downloads.sort()).toEqual([
    "skills/invoices/SKILL.md",
    "skills/invoices/reference.md",
  ]);
  expect(existsSync(join(dest, "invoices", "reference.md"))).toBe(true);
  expect(existsSync(join(dest, "payroll"))).toBe(false);
});

test("an agent that enabled no shared skill reads nothing at all", async () => {
  const { store, downloads } = sharedStore({
    "skills/invoices/SKILL.md": "x",
  });
  const listings = vi.fn(store.manifest);
  store.manifest = listings;
  const workspaceDir = mkdtempSync(join(tmpdir(), "shared-skills-none-"));

  await snapshotTurnSharedSkills(store, snapshotDir(), workspaceDir);

  expect(listings).not.toHaveBeenCalled();
  expect(downloads).toEqual([]);
});

test("a key that would land outside the snapshot is never written", async () => {
  const { store, downloads } = sharedStore({
    "skills/invoices/../../escape.md": "x",
    "skills/invoices/SKILL.md": "ok",
  });
  const dest = snapshotDir();

  await snapshotTurnSharedSkills(store, dest, workspaceEnabling("invoices"));

  expect(downloads).toEqual(["skills/invoices/SKILL.md"]);
  expect(existsSync(join(dest, "..", "escape.md"))).toBe(false);
});

test("a failed listing runs the turn without shared skills, and says so", async () => {
  const { store } = sharedStore({});
  store.manifest = async () => {
    throw new Error("object store GET manifest failed (503)");
  };

  await expect(
    snapshotTurnSharedSkills(
      store,
      snapshotDir(),
      workspaceEnabling("invoices"),
    ),
  ).resolves.toBeUndefined();
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("[shared-skills]"),
    expect.stringContaining("503"),
  );
});

test("a claimed turn reads its OWN org's shared skills through pod-store's manifest", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const objects: Record<string, string> = {
    "skills/invoices/SKILL.md": "---\nname: invoices\n---\n",
    "skills-old/invoices/SKILL.md": "stale",
  };
  // pod-store's contract: `?prefix=` must be a clean key (400 otherwise), and
  // an older pod-store matches it as a raw string, siblings included.
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const parsed = new URL(String(url));
    requests.push({
      url: parsed.toString(),
      headers: new Headers(init?.headers),
    });
    if (parsed.pathname.endsWith("/manifest")) {
      const prefix = parsed.searchParams.get("prefix") ?? "";
      if (!isObjectPrefix(prefix)) {
        return Response.json(
          { error: "invalid object prefix" },
          { status: 400 },
        );
      }
      return Response.json({
        objects: Object.keys(objects)
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key, size: 1, md5: "m", updated: "u" })),
      });
    }
    const key = decodeURIComponent(parsed.pathname.split("/objects/")[1] ?? "");
    return new Response(objects[key] ?? "", {
      status: key in objects ? 200 : 404,
    });
  }) as typeof fetch;
  const store = turnSharedSkillsStore(
    {
      gcsPrefix: "ws/org-a/agent-1",
      claim: {
        id: "claim-1",
        token: "7",
        bootId: "boot-1",
        heartbeatUrl: "https://gateway.test/v1/pod/claims/claim-1",
      },
      hostToken: "turn-v1.token-for-org-a-agent-1",
    },
    { poolStoreUrl: "https://gateway.test/", fetchImpl },
  );
  const dest = snapshotDir();

  await snapshotTurnSharedSkills(store, dest, workspaceEnabling("invoices"));

  expect(console.error).not.toHaveBeenCalled();
  expect(requests[0]?.url).toBe(
    "https://gateway.test/v1/pod/store/org-a/shared/manifest?prefix=skills",
  );
  expect(requests[0]?.headers.get("authorization")).toBe(
    "Bearer turn-v1.token-for-org-a-agent-1",
  );
  expect(requests[0]?.headers.get("x-houston-agent")).toBe("agent-1");
  expect(requests.map((request) => request.url)).not.toContainEqual(
    expect.stringContaining("skills-old"),
  );
  expect(readdirSync(dest)).toEqual(["invoices"]);
  expect(existsSync(join(dest, "invoices", "SKILL.md"))).toBe(true);
});

test("an unclaimed turn has no shared store to read", () => {
  expect(
    turnSharedSkillsStore(
      { gcsPrefix: "ws/org-a/agent-1" },
      { poolStoreUrl: "https://gateway.test" },
    ),
  ).toBeNull();
});

test("a failed download stops the rest before the turn goes on", async () => {
  const { store } = sharedStore({
    "skills/invoices/SKILL.md": "x",
    "skills/invoices/a.md": "a",
    "skills/invoices/b.md": "b",
  });
  let inFlight = 0;
  store.download = async (key, dest, opts) => {
    inFlight++;
    try {
      // Every read is under way before the first one fails.
      const failing = key.endsWith("SKILL.md");
      await new Promise((resolve) => setTimeout(resolve, failing ? 5 : 30));
      if (failing) throw new Error("GET failed (500)");
      if (opts?.signal?.aborted) throw new Error("aborted");
      writeFileSync(dest, "late");
    } finally {
      inFlight--;
    }
  };

  const dest = snapshotDir();
  await snapshotTurnSharedSkills(store, dest, workspaceEnabling("invoices"));

  // Nothing is left writing into a root the turn is about to remove, and no
  // half-fetched skill is offered.
  expect(inFlight).toBe(0);
  expect(readdirSync(dest)).toEqual([]);
});

test("a stalled shared store gives up and the turn runs without the skills", async () => {
  const { store } = sharedStore({});
  store.manifest = () => new Promise(() => undefined);
  const started = Date.now();

  await snapshotTurnSharedSkills(
    store,
    snapshotDir(),
    workspaceEnabling("invoices"),
    50,
  );

  expect(Date.now() - started).toBeLessThan(2_000);
  expect(console.error).toHaveBeenCalled();
});
