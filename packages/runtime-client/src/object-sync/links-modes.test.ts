import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { hydrate, syncBack } from "./hydrate";
import { LocalDirStore } from "./object-store";

const agent = "workspaces/Personal/Bob";

async function seeded() {
  const storeRoot = await mkdtemp(join(tmpdir(), "links-store-"));
  const root = join(storeRoot, ...agent.split("/"));
  await mkdir(join(root, "web", "node_modules", "typescript", "bin"), {
    recursive: true,
  });
  await mkdir(join(root, "web", "node_modules", ".bin"), { recursive: true });
  await writeFile(join(root, "CLAUDE.md"), "# Bob\n");
  await writeFile(
    join(root, "web", "node_modules", "typescript", "bin", "tsc"),
    "#!/bin/sh\n",
  );
  await chmod(
    join(root, "web", "node_modules", "typescript", "bin", "tsc"),
    0o755,
  );
  await symlink(
    "../typescript/bin/tsc",
    join(root, "web", "node_modules", ".bin", "tsc"),
  );
  const dest = await mkdtemp(join(tmpdir(), "links-dest-"));
  return { store: new LocalDirStore(storeRoot), storeRoot, dest };
}

const at = (dir: string, rel: string) =>
  join(dir, ...`${agent}/${rel}`.split("/"));

test("hydration lands links and the executable bit; an unchanged sync uploads nothing", async () => {
  const { store, dest } = await seeded();
  const manifest = await hydrate(store, "", dest);
  expect(await readlink(at(dest, "web/node_modules/.bin/tsc"))).toBe(
    "../typescript/bin/tsc",
  );
  expect(
    (await stat(at(dest, "web/node_modules/typescript/bin/tsc"))).mode & 0o100,
  ).toBe(0o100);
  expect(manifest.get(`${agent}/web/node_modules/.bin/tsc`)?.hash).toMatch(
    /^link:/,
  );
  const result = await syncBack(store, "", dest, manifest);
  expect(result.uploaded).toEqual([]);
  expect(result.deleted).toEqual([]);
});

test("a new link and a chmod +x reach the store; a removed link is deleted", async () => {
  const { store, storeRoot, dest } = await seeded();
  const manifest = await hydrate(store, "", dest);
  await writeFile(at(dest, "run.sh"), "echo hi\n");
  await chmod(at(dest, "run.sh"), 0o755);
  await symlink("run.sh", at(dest, "latest"));
  await rm(at(dest, "web/node_modules/.bin/tsc"));
  const result = await syncBack(store, "", dest, manifest);
  expect(result.uploaded.sort()).toEqual([
    `${agent}/latest`,
    `${agent}/run.sh`,
  ]);
  expect(result.deleted).toEqual([`${agent}/web/node_modules/.bin/tsc`]);
  expect(await readlink(at(storeRoot, "latest"))).toBe("run.sh");
  expect((await stat(at(storeRoot, "run.sh"))).mode & 0o100).toBe(0o100);

  const again = await mkdtemp(join(tmpdir(), "links-again-"));
  await hydrate(store, "", again);
  expect(await readlink(at(again, "latest"))).toBe("run.sh");
  expect((await stat(at(again, "run.sh"))).mode & 0o100).toBe(0o100);
});

test("only the executable bit changed: the file uploads again", async () => {
  const { store, dest } = await seeded();
  const manifest = await hydrate(store, "", dest);
  await chmod(at(dest, "CLAUDE.md"), 0o755);
  const result = await syncBack(store, "", dest, manifest);
  expect(result.uploaded).toEqual([`${agent}/CLAUDE.md`]);
});

test("a link out of the agent folder is reported, never uploaded, and holds no delete", async () => {
  const { store, storeRoot, dest } = await seeded();
  const manifest = await hydrate(store, "", dest);
  await mkdir(at(dest, ".venv/bin"), { recursive: true });
  await symlink("/etc/passwd", at(dest, ".venv/bin/python"));
  await rm(at(dest, "CLAUDE.md"));
  const result = await syncBack(store, "", dest, manifest, {
    holdDeletesOnFailure: true,
  });
  expect(result.skipped).toEqual([
    {
      key: `${agent}/.venv/bin/python`,
      reason: "link points outside the agent folder",
      refused: true,
    },
  ]);
  expect(result.deleted).toEqual([`${agent}/CLAUDE.md`]);
  await expect(lstat(at(storeRoot, ".venv/bin/python"))).rejects.toThrow();
});

test("a virtualenv's link to the system interpreter survives the next turn", async () => {
  const { store, dest } = await seeded();
  const manifest = await hydrate(store, "", dest);
  await mkdir(at(dest, ".venv/bin"), { recursive: true });
  await symlink("/usr/bin/python3", at(dest, ".venv/bin/python3"));
  await symlink("python3", at(dest, ".venv/bin/python"));
  const result = await syncBack(store, "", dest, manifest);
  expect(result.skipped).toEqual([]);
  expect(result.uploaded.sort()).toEqual([
    `${agent}/.venv/bin/python`,
    `${agent}/.venv/bin/python3`,
  ]);
  const next = await mkdtemp(join(tmpdir(), "venv-next-"));
  await hydrate(store, "", next);
  expect(await readlink(at(next, ".venv/bin/python3"))).toBe(
    "/usr/bin/python3",
  );
  expect(await readlink(at(next, ".venv/bin/python"))).toBe("python3");
});

test("a store without attributes keeps skipping links", async () => {
  const { store, dest } = await seeded();
  const manifest = await hydrate(store, "", dest);
  const plain = Object.assign(Object.create(store), { fileAttrs: undefined });
  await symlink("CLAUDE.md", at(dest, "readme"));
  const result = await syncBack(plain, "", dest, manifest);
  expect(result.uploaded).toEqual([]);
  expect(result.skipped).toEqual([]);
});

test("a listed link the store also holds files under is not landed", async () => {
  const { store, storeRoot, dest } = await seeded();
  await mkdir(at(storeRoot, "docs-real"), { recursive: true });
  await symlink("docs-real", at(storeRoot, "docs"));
  const manifest = await hydrate(
    {
      ...store,
      fileAttrs: true,
      list: store.list.bind(store),
      download: store.download.bind(store),
      upload: store.upload.bind(store),
      delete: store.delete.bind(store),
      manifest: async (prefix?: string) => [
        ...(await store.manifest(prefix)),
        { key: `${agent}/docs/inner.md`, size: 1, md5: "", updated: "" },
      ],
    },
    "",
    dest,
  );
  expect(manifest.has(`${agent}/docs`)).toBe(false);
  const landed = await lstat(at(dest, "docs")).catch(() => undefined);
  expect(landed?.isSymbolicLink() ?? false).toBe(false);
});
