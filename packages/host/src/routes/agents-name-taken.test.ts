import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { packAgent } from "@houston/domain";
import { type Capabilities, NAME_TAKEN } from "@houston/protocol";
import { beforeEach, expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { LocalPaths } from "../paths";
import type { ControlPlaneDeps } from "../server";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs } from "../vfs";
import { dispatchGroup } from "./registry/all";

/**
 * Every write that names an agent onto a name another AI Employee already
 * holds (PRODUCT-1929), over the real desktop store, where an agent IS its
 * folder. A create that reused the existing folder rewrote that employee's
 * CLAUDE.md and seeds, and a failing seed's rollback then deleted the whole
 * existing folder. Create, portable install and rename all refuse the name
 * BEFORE touching disk, whatever the letter case (macOS and Windows folders
 * are case-insensitive, so "mia" IS "Mia" there), with one 409 shape.
 */

const CAPS: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  tunnel: false,
  codeExecution: "local-bash",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};

const ORIGINAL = "# Mia\n\nThe original job description.";

let root: string;
let deps: ControlPlaneDeps;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "houston-create-existing-"));
  const store = new LocalWorkspaceStore(root);
  deps = {
    verifier: {
      async verify() {
        return null;
      },
    },
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: {},
    vfs: new FsVfs(root),
    paths: new LocalPaths(),
    capabilities: CAPS,
  } satisfies ControlPlaneDeps;
  expect((await post({ name: "Mia", claudeMd: ORIGINAL })).status).toBe(201);
});

function req(body: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, "utf8")]);
  return Object.assign(stream, {
    headers: { "content-type": "application/json" },
  }) as IncomingMessage;
}

function res() {
  const out = {
    status: 0,
    body: "",
    writeHead(status: number) {
      this.status = status;
      return this;
    },
    end(chunk?: unknown) {
      this.body = chunk ? String(chunk) : "";
      return this;
    },
  };
  return out as unknown as ServerResponse & typeof out;
}

/** One request's routing context, and the response it will be answered on. */
function request(method: string, path: string, body: unknown) {
  const response = res();
  const ctx = {
    deps,
    userId: "local-owner",
    method,
    path,
    url: new URL(path, "http://host.local"),
    req: req(JSON.stringify(body)),
    res: response,
  };
  return { response, ctx };
}

async function post(body: unknown) {
  const { response, ctx } = request("POST", "/agents", body);
  expect(await dispatchGroup("agents", ctx)).toBe(true);
  return response;
}

async function install(body: unknown) {
  const { response, ctx } = request("POST", "/v1/portable/install", body);
  expect(await dispatchGroup("portable-account", ctx)).toBe(true);
  return response;
}

async function rename(agentId: string, name: string) {
  const path = `/agents/${encodeURIComponent(agentId)}`;
  const { response, ctx } = request("PATCH", path, { name });
  expect(await dispatchGroup("agent-crud", ctx)).toBe(true);
  return response;
}

const miaDir = () => join(root, "Personal", "Mia");

async function agentNames(): Promise<string[]> {
  const ws = await deps.store.getOrCreatePersonalWorkspace("local-owner");
  return (await deps.store.listAgents(ws.id)).map((a) => a.name);
}

test.each([
  ["the exact name", "Mia"],
  ["a case variant", "mia"],
  ["a padded case variant", "  MIA "],
])(
  "creating %s answers 409 name_taken and leaves the existing employee untouched",
  async (_label, name) => {
    const response = await post({ name, claudeMd: "# Impostor" });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ code: NAME_TAKEN });
    expect(readFileSync(join(miaDir(), "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    expect(await agentNames()).toEqual(["Mia"]);
  },
);

test.each([
  ["the exact name", "Mia"],
  ["a case variant", "mia"],
])(
  "a failing seed on %s never deletes the existing employee's folder",
  async (_label, name) => {
    // A traversal key makes writeAgentSeeds throw mid-write, which is what runs
    // the create's rollback.
    const response = await post({
      name,
      seeds: { "notes.json": "[]", "../evil": "x" },
    }).catch((err: unknown) => err);

    expect(response).toMatchObject({ status: 409 });
    expect(existsSync(miaDir())).toBe(true);
    expect(readFileSync(join(miaDir(), "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    expect(await agentNames()).toEqual(["Mia"]);
  },
);

test.each(["Mia", "mia"])(
  "a portable install named %j answers 409 name_taken and keeps Mia's job description",
  async (agentName) => {
    const archive = packAgent(
      { claudeMd: "# Imported", skills: [], routines: [], learnings: [] },
      { agentName: "Mia", houstonVersion: "test" },
      "2026-01-01T00:00:00.000Z",
    );
    const response = await install({
      agentName,
      archive: Buffer.from(archive).toString("base64"),
    });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ code: NAME_TAKEN });
    expect(readFileSync(join(miaDir(), "CLAUDE.md"), "utf8")).toBe(ORIGINAL);
    expect(await agentNames()).toEqual(["Mia"]);
  },
);

test("renaming onto a case variant of another employee answers the same 409", async () => {
  expect((await post({ name: "Leo" })).status).toBe(201);
  const response = await rename("Personal/Leo", "MIA");

  expect(response.status).toBe(409);
  expect(JSON.parse(response.body)).toMatchObject({ code: NAME_TAKEN });
  expect((await agentNames()).sort()).toEqual(["Leo", "Mia"]);
});

test("renaming an employee to a new spelling of its own name works", async () => {
  const response = await rename("Personal/Mia", "MIA");

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({ name: "MIA" });
  expect(await agentNames()).toEqual(["MIA"]);
  expect(readFileSync(join(root, "Personal", "MIA", "CLAUDE.md"), "utf8")).toBe(
    ORIGINAL,
  );
});

test("a portable install whose seeding fails leaves no agent behind, so a retry succeeds", async () => {
  const archive = packAgent(
    { claudeMd: "# Nova", skills: [], routines: [], learnings: [] },
    { agentName: "Nova", houstonVersion: "test" },
    "2026-01-01T00:00:00.000Z",
  );
  const body = {
    agentName: "Nova",
    archive: Buffer.from(archive).toString("base64"),
  };
  const vfs = deps.vfs as FsVfs;
  const realWrite = vfs.writeText.bind(vfs);
  let failNext = true;
  deps.vfs = Object.assign(Object.create(vfs) as FsVfs, {
    async writeText(key: string, content: string) {
      if (failNext && key.endsWith("CLAUDE.md")) {
        failNext = false;
        throw new Error("disk full");
      }
      return realWrite(key, content);
    },
  });

  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(install(body)).rejects.toThrow("disk full");
  // A clean rollback leaves no "rollback failed" breadcrumb in backend.log.
  expect(logged).not.toHaveBeenCalled();
  logged.mockRestore();
  expect(await agentNames()).toEqual(["Mia"]);
  expect(existsSync(join(root, "Personal", "Nova"))).toBe(false);

  const retry = await install(body);
  expect(retry.status).toBe(201);
  expect((await agentNames()).sort()).toEqual(["Mia", "Nova"]);
  expect(
    readFileSync(join(root, "Personal", "Nova", "CLAUDE.md"), "utf8"),
  ).toBe("# Nova");
});
