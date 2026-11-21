import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "./fs";
import { VfsExistsError } from "./vfs";

const root = () => mkdtempSync(join(tmpdir(), "houston-vfs-move-"));

const P = "ws/w1/agent-1/workspace";

test("a symlink moved onto its own target is refused, and the target survives", async () => {
  const dir = root();
  const vfs = new FsVfs(dir);
  await vfs.writeText(`${P}/real.txt`, "the user's report");
  symlinkSync(
    join(dir, ...`${P}/real.txt`.split("/")),
    join(dir, ...`${P}/link.txt`.split("/")),
  );

  await expect(
    vfs.move(`${P}/link.txt`, `${P}/real.txt`),
  ).rejects.toBeInstanceOf(VfsExistsError);
  expect(readFileSync(join(dir, ...`${P}/real.txt`.split("/")), "utf8")).toBe(
    "the user's report",
  );
});

test("a symlink renamed to a free name moves the link itself", async () => {
  const dir = root();
  const vfs = new FsVfs(dir);
  await vfs.writeText(`${P}/real.txt`, "content");
  symlinkSync(
    join(dir, ...`${P}/real.txt`.split("/")),
    join(dir, ...`${P}/link.txt`.split("/")),
  );

  await vfs.move(`${P}/link.txt`, `${P}/alias.txt`);
  expect(await vfs.readText(`${P}/alias.txt`)).toBe("content");
  expect(await vfs.readText(`${P}/real.txt`)).toBe("content");
});

test("a dangling symlink at the destination is not a free name", async () => {
  const dir = root();
  const vfs = new FsVfs(dir);
  await vfs.writeText(`${P}/notes.md`, "mine");
  await mkdir(join(dir, ...P.split("/")), { recursive: true });
  symlinkSync(
    join(dir, "gone.txt"),
    join(dir, ...`${P}/broken.txt`.split("/")),
  );

  await expect(
    vfs.move(`${P}/notes.md`, `${P}/broken.txt`),
  ).rejects.toBeInstanceOf(VfsExistsError);
  expect(await vfs.readText(`${P}/notes.md`)).toBe("mine");
});
