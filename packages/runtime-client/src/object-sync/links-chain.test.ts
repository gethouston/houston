import {
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { hydrate, syncBack } from "./hydrate";
import type { ObjectMetadata } from "./object-manifest";
import type { ObjectStore } from "./object-store";
import { ObjectNotFoundError } from "./object-store-errors";

const root = "workspaces/ws/agent";
const meta = (key: string, link?: string): ObjectMetadata => ({
  key,
  size: 1,
  md5: "",
  updated: "",
  ...(link ? { link } : {}),
});

function listedStore(objects: ObjectMetadata[]): ObjectStore {
  return {
    fileAttrs: true,
    list: async () => objects.map(({ key }) => key),
    manifest: async () => objects,
    download: async (key, dest) => {
      if (key.endsWith("missing")) throw new ObjectNotFoundError(key, "gone");
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, "bytes");
    },
    upload: async () => undefined,
    delete: async () => undefined,
  };
}

test("a link under another link never lands", async () => {
  const dest = await mkdtemp(join(tmpdir(), "chain-"));
  const manifest = await hydrate(
    listedStore([
      meta(`${root}/a/b/c/d/up`, "../../.."),
      meta(`${root}/a/b/c/d/up/esc`, "../../../../../x"),
    ]),
    "",
    dest,
  );
  expect(await readlink(join(dest, root, "a/b/c/d/up"))).toBe("../../..");
  expect(manifest.has(`${root}/a/b/c/d/up/esc`)).toBe(false);
  await expect(lstat(join(dest, root, "a/esc"))).rejects.toThrow();
});

test("a file under a link landed in an earlier pass never lands", async () => {
  const dest = await mkdtemp(join(tmpdir(), "chain-"));
  const started = await hydrate(
    listedStore([
      meta(`${root}/.claude/skills`, "../sub"),
      meta(`${root}/sub/x`),
    ]),
    "",
    dest,
    {
      priority: (rel) => rel.endsWith("skills"),
      listing: {
        objects: [meta(`${root}/.claude/skills`, "../sub")],
        later: async () => [meta(`${root}/.claude/skills/planted.md`)],
      },
      defer: () => true,
    },
  );
  expect(started.has(`${root}/.claude/skills/planted.md`)).toBe(false);
  await expect(lstat(join(dest, root, "sub/planted.md"))).rejects.toThrow();
});

test("a link under a file is skipped, not a failed hydration", async () => {
  const dest = await mkdtemp(join(tmpdir(), "chain-"));
  const manifest = await hydrate(
    listedStore([meta(`${root}/a`), meta(`${root}/a/b`, "../c")]),
    "",
    dest,
  );
  expect(manifest.has(`${root}/a`)).toBe(true);
  expect(manifest.has(`${root}/a/b`)).toBe(false);
});

test("a hydrated link stays owned when a later listing says the store keeps no links", async () => {
  const dest = await mkdtemp(join(tmpdir(), "chain-"));
  const store = listedStore([meta(`${root}/latest`, "notes.md")]);
  const manifest = await hydrate(store, "", dest);
  const deletes: string[] = [];
  const older: ObjectStore = {
    ...store,
    fileAttrs: false,
    delete: async (key) => {
      deletes.push(key);
    },
  };
  await symlink("notes.md", join(dest, root, "other"));
  const result = await syncBack(older, "", dest, manifest);
  expect(deletes).toEqual([]);
  expect(result.manifest.has(`${root}/latest`)).toBe(true);
  expect(result.uploaded).toEqual([]);
});
