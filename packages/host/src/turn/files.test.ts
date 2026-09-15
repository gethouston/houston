import { expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { MemoryVfs } from "../vfs";
import {
  contentDisposition,
  createWorkspaceFolder,
  deleteWorkspaceFile,
  FileOpError,
  FilePathError,
  handleFiles,
  listWorkspace,
  mimeFor,
  readWorkspaceFile,
  renameWorkspaceFile,
} from "./files";
import { moveWorkspaceEntry } from "./files-move";

/**
 * The Files tab over an agent's workspace root, served by the host for every
 * profile (cloud GCS prefix `<prefix>/workspace`, local FS `<W>/<A>`). The agent
 * writes files to that root during a turn; these endpoints make them show up, be
 * readable, downloadable, renamable, and deletable. Internal Houston state
 * (`.houston`, `.agents`) is hidden + refused, and path-safety stops a hostile
 * rel-path escaping the root.
 */

const PREFIX = "ws/w1/agent-1";
const ROOT = `${PREFIX}/workspace`; // cloud agentRoot

async function seed(objects: MemoryVfs, rel: string, content: string) {
  await objects.writeText(`${ROOT}/${rel}`, content);
}

/** A paths stub that resolves any agent to ROOT, for the handleFiles HTTP cases. */
const PATHS = { agentRoot: () => ROOT } as unknown as WorkspacePaths;
const CTX = { workspace: {} as Workspace, agent: {} as Agent };

test("lists workspace files with synthesized folders, newest metadata", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "deck.pptx", "PPTX");
  await seed(objects, "data/sales.csv", "a,b\n1,2");
  await seed(objects, "data/notes.txt", "hi");

  const files = await listWorkspace(objects, ROOT);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  // The folder is synthesized and sorts first.
  expect(byPath.data?.is_directory).toBe(true);
  expect(files[0]?.is_directory).toBe(true);
  // Files carry name/extension/size.
  expect(byPath["deck.pptx"]).toMatchObject({
    name: "deck.pptx",
    extension: "pptx",
    is_directory: false,
  });
  expect(byPath["data/sales.csv"]).toMatchObject({
    name: "sales.csv",
    extension: "csv",
  });
  expect(byPath["data/sales.csv"]?.size).toBeGreaterThan(0);
});

test("conversation/settings data outside the root is NOT listed", async () => {
  const objects = new MemoryVfs();
  await objects.writeText(`${PREFIX}/data/conversations/c1.json`, "{}");
  await seed(objects, "report.txt", "x");
  const files = await listWorkspace(objects, ROOT);
  expect(files.map((f) => f.path)).toEqual(["report.txt"]);
});

test("local layout (no workspace/ split): lists user files, hides .houston/.agents internals", async () => {
  const objects = new MemoryVfs();
  const LOCAL = "Houston/Bo"; // local agentRoot — the agent dir IS the root
  await objects.writeText(`${LOCAL}/report.txt`, "hi");
  await objects.writeText(`${LOCAL}/Decks/q3.pptx`, "PPTX");
  await objects.writeText(`${LOCAL}/CLAUDE.md`, "instructions");
  await objects.writeText(`${LOCAL}/.houston/activity/activity.json`, "[]");
  await objects.writeText(`${LOCAL}/.agents/skills/alarm/SKILL.md`, "x");

  const paths = (await listWorkspace(objects, LOCAL)).map((f) => f.path).sort();
  expect(paths).toContain("report.txt");
  expect(paths).toContain("Decks"); // synthesized folder
  expect(paths).toContain("Decks/q3.pptx");
  expect(paths).toContain("CLAUDE.md");
  // Internal Houston state is never exposed in the Files tab.
  expect(paths.some((p) => p.startsWith(".houston"))).toBe(false);
  expect(paths.some((p) => p.startsWith(".agents"))).toBe(false);
});

test("reads text as content, binary as base64", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "notes.txt", "hello world");
  await objects.writeText(`${ROOT}/blob.bin`, "PK�� payload"); // U+FFFD => treated as binary
  const text = await readWorkspaceFile(objects, ROOT, "notes.txt");
  expect(text).toEqual({ content: "hello world", base64: false });
  const bin = await readWorkspaceFile(objects, ROOT, "blob.bin");
  expect(bin?.base64).toBe(true);
  expect(await readWorkspaceFile(objects, ROOT, "missing.txt")).toBeNull();
});

test("delete removes a file; delete of a folder removes everything under it", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "keep.txt", "k");
  await seed(objects, "trash/a.txt", "a");
  await seed(objects, "trash/b.txt", "b");
  await deleteWorkspaceFile(objects, ROOT, "trash");
  const paths = (await listWorkspace(objects, ROOT)).map((f) => f.path);
  expect(paths).toEqual(["keep.txt"]);
});

test("rename moves a file within its folder, preserving content", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/old.csv", "1,2,3");
  await renameWorkspaceFile(objects, ROOT, "data/old.csv", "new.csv");
  expect(await readWorkspaceFile(objects, ROOT, "data/new.csv")).toEqual({
    content: "1,2,3",
    base64: false,
  });
  expect(await readWorkspaceFile(objects, ROOT, "data/old.csv")).toBeNull();
});

test("renaming a file that is gone answers 404, never a 500", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/kept.csv", "1,2,3");
  // The op names the status itself: a source deleted in another tab (or a stale
  // listing) is the user's state, not a server fault.
  const rejected = renameWorkspaceFile(objects, ROOT, "data/gone.csv", "x.csv");
  await expect(rejected).rejects.toBeInstanceOf(FileOpError);
  await expect(rejected).rejects.toMatchObject({ status: 404 });
});

test("renaming onto a name already in use is refused, both files intact", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/old.csv", "old");
  await seed(objects, "data/taken.csv", "taken");
  // Same conflict the move op names (files-move.ts): a rename that silently
  // overwrote the other file would destroy content the user never chose to lose.
  const rejected = renameWorkspaceFile(
    objects,
    ROOT,
    "data/old.csv",
    "taken.csv",
  );
  await expect(rejected).rejects.toBeInstanceOf(FileOpError);
  await expect(rejected).rejects.toMatchObject({
    status: 409,
    code: "name_taken",
    message: '"taken.csv" already exists there',
  });
  expect(await readWorkspaceFile(objects, ROOT, "data/old.csv")).toEqual({
    content: "old",
    base64: false,
  });
  expect(await readWorkspaceFile(objects, ROOT, "data/taken.csv")).toEqual({
    content: "taken",
    base64: false,
  });
});

test("renaming onto an existing FOLDER's name is refused too", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "notes.txt", "n");
  await seed(objects, "Reports/q1.csv", "1");
  await expect(
    renameWorkspaceFile(objects, ROOT, "notes.txt", "Reports"),
  ).rejects.toMatchObject({ status: 409 });
  expect(await readWorkspaceFile(objects, ROOT, "Reports/q1.csv")).toEqual({
    content: "1",
    base64: false,
  });
});

test("renaming a file to the name it already has changes nothing", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/old.csv", "1,2,3");
  expect(
    await renameWorkspaceFile(objects, ROOT, "data/old.csv", "old.csv"),
  ).toBe("unchanged");
  expect(await readWorkspaceFile(objects, ROOT, "data/old.csv")).toEqual({
    content: "1,2,3",
    base64: false,
  });
});

/**
 * A store that folds letter case — the macOS/Windows disk every desktop user
 * runs on. The MemoryVfs stands in for it so these cases hold on a
 * case-SENSITIVE CI volume too (`files-ops.fs.test.ts` proves the real disk
 * agrees with whichever kind it is).
 */
const foldedVfs = () => new MemoryVfs({ keyCase: "folded" });

test("a folded store refuses a rename that differs only in case from a sibling", async () => {
  const objects = foldedVfs();
  await objects.writeText(`${ROOT}/readme.md`, "kept");
  await objects.writeText(`${ROOT}/notes.md`, "moved");
  // Without the fold this passed the guard and `readme.md` was gone for good.
  await expect(
    renameWorkspaceFile(objects, ROOT, "notes.md", "README.md"),
  ).rejects.toMatchObject({ status: 409, code: "name_taken" });
  expect(await readWorkspaceFile(objects, ROOT, "readme.md")).toEqual({
    content: "kept",
    base64: false,
  });
  expect(await readWorkspaceFile(objects, ROOT, "notes.md")).toEqual({
    content: "moved",
    base64: false,
  });
});

test("a folded store still performs a case-ONLY rename", async () => {
  const objects = foldedVfs();
  await objects.writeText(`${ROOT}/readme.md`, "doc");
  // The destination is the file's own slot: a re-spelling, not a collision and
  // not a no-op.
  expect(
    await renameWorkspaceFile(objects, ROOT, "readme.md", "README.md"),
  ).toBe("renamed");
  expect((await listWorkspace(objects, ROOT)).map((f) => f.name)).toEqual([
    "README.md",
  ]);
});

test("a folded store refuses a move onto a sibling that differs only in case", async () => {
  const objects = foldedVfs();
  await objects.writeText(`${ROOT}/Docs/Report.pdf`, "kept");
  await objects.writeText(`${ROOT}/report.pdf`, "moved");
  await expect(
    moveWorkspaceEntry(objects, ROOT, "report.pdf", "Docs"),
  ).rejects.toMatchObject({ status: 409, code: "name_taken" });
  expect(await readWorkspaceFile(objects, ROOT, "Docs/Report.pdf")).toEqual({
    content: "kept",
    base64: false,
  });
});

test("createFolder makes an empty folder visible via a hidden marker", async () => {
  const objects = new MemoryVfs();
  expect(await createWorkspaceFolder(objects, ROOT, "Reports")).toBe("Reports");
  const files = await listWorkspace(objects, ROOT);
  expect(files.find((f) => f.path === "Reports")?.is_directory).toBe(true);
  // The .keep marker is hidden from the listing.
  expect(files.some((f) => f.name === ".keep")).toBe(false);
});

test("path traversal and absolute paths are rejected everywhere", async () => {
  const objects = new MemoryVfs();
  await expect(
    readWorkspaceFile(objects, ROOT, "../auth.json"),
  ).rejects.toThrow(FilePathError);
  await expect(readWorkspaceFile(objects, ROOT, "/etc/passwd")).rejects.toThrow(
    FilePathError,
  );
  await expect(
    deleteWorkspaceFile(objects, ROOT, "../../other"),
  ).rejects.toThrow(FilePathError);
  await expect(
    renameWorkspaceFile(objects, ROOT, "a.txt", "../evil"),
  ).rejects.toThrow(FilePathError);
  await expect(
    renameWorkspaceFile(objects, ROOT, "a.txt", "sub/evil"),
  ).rejects.toThrow(FilePathError);
  await expect(createWorkspaceFolder(objects, ROOT, "../evil")).rejects.toThrow(
    FilePathError,
  );
});

test("internal dot-dirs are refused by every path op", async () => {
  const objects = new MemoryVfs();
  await expect(
    readWorkspaceFile(objects, ROOT, ".houston/activity/activity.json"),
  ).rejects.toThrow(FilePathError);
  await expect(deleteWorkspaceFile(objects, ROOT, ".agents")).rejects.toThrow(
    FilePathError,
  );
  await expect(
    renameWorkspaceFile(objects, ROOT, "a.txt", ".hidden"),
  ).rejects.toThrow(FilePathError);
  await expect(createWorkspaceFolder(objects, ROOT, ".secret")).rejects.toThrow(
    FilePathError,
  );
});

function fakeRes() {
  const state = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: null as Buffer | null,
  };
  const res = {
    writeHead(code: number, h?: Record<string, unknown>) {
      state.status = code;
      if (h) Object.assign(state.headers, h);
      return this;
    },
    end(buf?: Buffer | string) {
      if (buf !== undefined)
        state.body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    },
  };
  return { res: res as never, state };
}

test("download serves raw bytes with the right MIME + disposition", async () => {
  const objects = new MemoryVfs();
  // Non-UTF-8 payload: must come back byte-for-byte, not JSON/base64.
  const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  await objects.writeBytes(`${ROOT}/deck.pptx`, payload);

  const { res, state } = fakeRes();
  const handled = await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    res,
    new URLSearchParams({ path: "deck.pptx" }),
  );
  expect(handled).toBe(true);
  expect(state.status).toBe(200);
  expect(state.headers["Content-Type"]).toBe(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  expect(String(state.headers["Content-Disposition"])).toContain(
    'attachment; filename="deck.pptx"',
  );
  if (state.body === null) throw new Error("expected response body to be set");
  expect(Buffer.compare(state.body, payload)).toBe(0);
});

test("download honors disposition=inline, 404s on missing, rejects traversal", async () => {
  const objects = new MemoryVfs();
  await objects.writeBytes(
    `${ROOT}/chart.png`,
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  );

  expect(mimeFor("Reporte Ventas.PDF")).toBe("application/pdf");
  expect(mimeFor("weird.bin")).toBe("application/octet-stream");
  expect(contentDisposition("inline", "café.pdf")).toBe(
    `inline; filename="caf_.pdf"; filename*=UTF-8''caf%C3%A9.pdf`,
  );

  const inline = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    inline.res,
    new URLSearchParams({ path: "chart.png", disposition: "inline" }),
  );
  expect(inline.state.status).toBe(200);
  expect(
    String(inline.state.headers["Content-Disposition"]).startsWith("inline;"),
  ).toBe(true);

  // The 404 carries a host log line saying why (PRODUCT-1780): here the
  // agent's absolute pod path is stripped, the root has a sibling, no
  // FilesChanged was ever seen for this agent.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const missing = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    missing.res,
    new URLSearchParams({ path: `/data/${ROOT}/missing.pdf` }),
  );
  expect(missing.state.status).toBe(404);
  expect(JSON.parse(String(missing.state.body))).toEqual({
    error: "file not found",
  });
  expect(warn).toHaveBeenCalledWith(
    "[files] not found: missing.pdf (1 sibling(s): chart.png; no FilesChanged seen)",
  );
  warn.mockRestore();

  const evil = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "GET",
    "files/download",
    { url: "/x" } as never,
    evil.res,
    new URLSearchParams({ path: "../data/conversations/c1.json" }),
  );
  expect(evil.state.status).toBe(400);
});

test("a missing vfs answers 503 for files routes", async () => {
  const { res, state } = fakeRes();
  const handled = await handleFiles(
    undefined,
    PATHS,
    CTX,
    "GET",
    "files",
    { url: "/x" } as never,
    res,
    new URLSearchParams(),
  );
  expect(handled).toBe(true);
  expect(state.status).toBe(503);
});

test("listing reports date_created for files and the oldest one for folders", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/first.csv", "1"); // created @ clock 1
  await seed(objects, "data/second.csv", "2"); // created @ clock 2
  await objects.writeText(`${ROOT}/data/first.csv`, "1-updated"); // overwrite keeps createdMs

  const byPath = Object.fromEntries(
    (await listWorkspace(objects, ROOT)).map((f) => [f.path, f]),
  );
  expect(byPath["data/first.csv"]?.date_created).toBe(1);
  expect(byPath["data/second.csv"]?.date_created).toBe(2);
  // The folder inherits the OLDEST creation and the NEWEST modification beneath it.
  expect(byPath.data?.date_created).toBe(1);
  expect(byPath.data?.date_modified).toBe(3);
});

/** A fake IncomingMessage that yields a JSON body once (async-iterable). */
function fakeReq(body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  return (async function* () {
    yield buf;
  })() as never;
}

test("POST files/rename on a missing source is a 404 response body", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/kept.csv", "1,2,3");
  const { res, state } = fakeRes();
  const handled = await handleFiles(
    objects,
    PATHS,
    CTX,
    "POST",
    "files/rename",
    fakeReq({ path: "data/gone.csv", newName: "x.csv" }),
    res,
    new URLSearchParams(),
  );
  expect(handled).toBe(true);
  expect(state.status).toBe(404);
  expect(JSON.parse(String(state.body)) as { error: string }).toEqual({
    error: "file not found",
  });
});

test("POST files/rename onto a taken name is a 409 response body", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "data/old.csv", "old");
  await seed(objects, "data/taken.csv", "taken");
  const { res, state } = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    CTX,
    "POST",
    "files/rename",
    fakeReq({ path: "data/old.csv", newName: "taken.csv" }),
    res,
    new URLSearchParams(),
  );
  expect(state.status).toBe(409);
  // The CODE is what the client matches on: a second 409 on this route would
  // otherwise inherit the taken-name copy (`app/src/lib/file-conflicts.ts`).
  expect(
    JSON.parse(String(state.body)) as { error: string; code: string },
  ).toEqual({
    error: '"taken.csv" already exists there',
    code: "name_taken",
  });
});

test("a rename to the name the file already has announces nothing", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "Docs/a.txt", "a");
  const events: string[] = [];
  const handled = await handleFiles(
    objects,
    PATHS,
    { workspace: {} as Workspace, agent: { id: "Houston/Bo" } as Agent },
    "POST",
    "files/rename",
    fakeReq({ path: "Docs/a.txt", newName: "a.txt" }),
    fakeRes().res,
    new URLSearchParams(),
    ((e: { type: string }) => events.push(e.type)) as never,
  );
  expect(handled).toBe(true);
  // Nothing moved, so no other client has anything to refetch.
  expect(events).toEqual([]);
});

test("every files mutation emits FilesChanged; reads do not", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "Docs/a.txt", "a");
  const ctx = {
    workspace: {} as Workspace,
    agent: { id: "Houston/Bo" } as Agent,
  };
  const events: string[] = [];
  const emit = (e: { type: string; agentPath?: string }) => {
    expect(e.agentPath).toBe("Houston/Bo");
    events.push(e.type);
  };
  const run = (
    method: string,
    rest: string,
    req: unknown,
    query: Record<string, string> = {},
  ) =>
    handleFiles(
      objects,
      PATHS,
      ctx,
      method,
      rest,
      req as never,
      fakeRes().res,
      new URLSearchParams(query),
      emit as never,
    );

  await run("GET", "files", { url: "/x" });
  expect(events).toEqual([]);

  await run(
    "POST",
    "files/import",
    fakeReq({
      files: [
        { name: "up.txt", contentBase64: Buffer.from("up").toString("base64") },
      ],
    }),
  );
  await run("POST", "files/move", fakeReq({ path: "up.txt", toDir: "Docs" }));
  await run(
    "POST",
    "files/rename",
    fakeReq({ path: "Docs/up.txt", newName: "up2.txt" }),
  );
  await run("POST", "files/folder", fakeReq({ path: "Reports" }));
  await run("DELETE", "files", { url: "/x" }, { path: "Docs/up2.txt" });
  expect(events).toEqual([
    "FilesChanged",
    "FilesChanged",
    "FilesChanged",
    "FilesChanged",
    "FilesChanged",
  ]);
});

test("files/archive serves a zip of the workspace over HTTP", async () => {
  const objects = new MemoryVfs();
  await seed(objects, "report.md", "# hi");
  const ctx = {
    workspace: {} as Workspace,
    agent: { id: "Houston/Bo", name: "Bo" } as Agent,
  };
  const { res, state } = fakeRes();
  await handleFiles(
    objects,
    PATHS,
    ctx,
    "GET",
    "files/archive",
    { url: "/x" } as never,
    res,
    new URLSearchParams(),
  );
  expect(state.status).toBe(200);
  expect(state.headers["Content-Type"]).toBe("application/zip");
  expect(String(state.headers["Content-Disposition"])).toContain(
    "Bo files.zip",
  );
  expect(state.body?.subarray(0, 2).toString("latin1")).toBe("PK");
});
