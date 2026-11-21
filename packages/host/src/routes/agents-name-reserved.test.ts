import { existsSync, mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { packAgent, RESERVED_AGENT_NAME_MESSAGE } from "@houston/domain";
import {
  type Capabilities,
  NAME_RESERVED,
  NAME_TAKEN,
} from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { LocalPaths } from "../paths";
import type { ControlPlaneDeps } from "../server";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs } from "../vfs";
import { dispatchGroup } from "./registry/all";

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

let root: string;
let deps: ControlPlaneDeps;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "houston-reserved-name-"));
  deps = {
    verifier: {
      async verify() {
        return null;
      },
    },
    store: new LocalWorkspaceStore(root),
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: {},
    vfs: new FsVfs(root),
    paths: new LocalPaths(),
    capabilities: CAPS,
  } satisfies ControlPlaneDeps;
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

function expectReserved(response: { status: number; body: string }) {
  expect(response.status).toBe(400);
  expect(JSON.parse(response.body)).toEqual({
    error: RESERVED_AGENT_NAME_MESSAGE,
    code: NAME_RESERVED,
  });
}

async function agentNames(): Promise<string[]> {
  const ws = await deps.store.getOrCreatePersonalWorkspace("local-owner");
  return (await deps.store.listAgents(ws.id)).map((a) => a.name).sort();
}

test.each([
  "Houston",
  "houston",
  "  HOUSTON ",
])("a desktop create named %j answers 400 name_reserved and makes no folder", async (name) => {
  expectReserved(await post({ name }));
  expect(existsSync(join(root, "Personal", name.trim()))).toBe(false);
  expect(await agentNames()).toEqual([]);
});

test("names that only contain Houston are ordinary names", async () => {
  expect((await post({ name: "Houston Sales" })).status).toBe(201);
  expect((await post({ name: "Houston 2" })).status).toBe(201);
  expect(await agentNames()).toEqual(["Houston 2", "Houston Sales"]);
});

test("the desktop-to-cloud move keeps a Houston employee's name, but never over another agent", async () => {
  expect((await post({ name: "Houston", migration: true })).status).toBe(201);
  const again = await post({ name: "houston", migration: true });

  expect(again.status).toBe(409);
  expect(JSON.parse(again.body)).toMatchObject({ code: NAME_TAKEN });
  expect(await agentNames()).toEqual(["Houston"]);
});

test("only a literal `migration: true` skips the reservation", async () => {
  expectReserved(await post({ name: "Houston", migration: "true" }));
});

test("a gateway seed of an existing Houston employee succeeds on the managed pod", async () => {
  deps.gatewayFronted = true;
  expect((await post({ name: "Houston" })).status).toBe(201);
  expect(await agentNames()).toEqual(["Houston"]);
});

test("renaming an employee to Houston answers 400 name_reserved and keeps its name", async () => {
  expect((await post({ name: "Mia" })).status).toBe(201);
  expectReserved(await rename("Personal/Mia", "Houston"));
  expect(await agentNames()).toEqual(["Mia"]);
});

test("an employee already named Houston saves its own name, in any spelling, and can leave it", async () => {
  expect((await post({ name: "Houston", migration: true })).status).toBe(201);

  const same = await rename("Personal/Houston", "Houston");
  expect(same.status).toBe(200);
  const recased = await rename("Personal/Houston", "HOUSTON");
  expect(recased.status).toBe(200);
  expect(await agentNames()).toEqual(["HOUSTON"]);

  expect((await rename("Personal/HOUSTON", "Hugo")).status).toBe(200);
  expect(await agentNames()).toEqual(["Hugo"]);
  expectReserved(await rename("Personal/Hugo", "Houston"));
});

test("behind the gateway a rename onto Houston is the gateway's call, not the pod's", async () => {
  expect((await post({ name: "Mia" })).status).toBe(201);
  deps.gatewayFronted = true;
  expect((await rename("Personal/Mia", "Houston")).status).toBe(200);
});

test("a portable install named Houston answers 400 name_reserved", async () => {
  const archive = packAgent(
    { claudeMd: "# Houston", skills: [], routines: [], learnings: [] },
    { agentName: "Houston", houstonVersion: "test" },
    "2026-01-01T00:00:00.000Z",
  );
  const response = await install({
    agentName: "houston",
    archive: Buffer.from(archive).toString("base64"),
  });

  expectReserved(response);
  expect(await agentNames()).toEqual([]);
});
