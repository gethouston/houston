import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { fakeVm } from "../code-vm/fake-vm.test-support";
import { TurnCodeVm } from "../code-vm/turn-code-vm";
import { WORKDIR } from "../code-vm/types";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import { TURN_CODE_RUN_PATH } from "./turn-sandbox-code";
import { createTurnSandbox } from "./turn-sandbox-startup";
import type { TurnGrantScope, TurnRequest } from "./types";

/**
 * `vm` mode: the turn's `/sandbox/code/run` runs in the turn's own micro-VM
 * instead of relaying to the gateway, and the facade's dispose (the turn's
 * cleanup, on every exit path) destroys that VM.
 */

afterEach(() => vi.restoreAllMocks());

const store: ObjectStore = {
  list: async () => [],
  manifest: async () => [],
  download: async () => undefined,
  upload: async () => ({ generation: "1" }),
  delete: async () => undefined,
};

const grant = (scopes: TurnGrantScope[]) => ({
  url: "https://gateway.test",
  token: "grant-secret",
  expires: 2_000_000_000,
  scopes,
});

async function filesystem(): Promise<TurnFilesystem> {
  const root = await mkdtemp(join(tmpdir(), "turn-sandbox-vm-"));
  return {
    kind: "standing",
    storeRoot: root,
    workspaceRel: "w",
    workspaceDir: join(root, "w"),
    dataRel: "w/.houston/runtime",
    dataDir: join(root, "w/.houston/runtime"),
    manifest: new Map(),
    vfs: new FsVfs(root),
    listedObjects: 0,
    skippedObjects: 0,
    generationAware: true,
    immediateWrites: new Set(),
  };
}

async function facade(codeVm: TurnCodeVm) {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({}));
  const sandbox = makeTurnSandboxFetch({
    grant: grant(["code-run"]),
    hostToken: "host-secret",
    store,
    prefix: "",
    filesystem: await filesystem(),
    workspaceId: "w1",
    conversationId: "c1",
    orgSlug: "org",
    agentSlug: "agent",
    fetchImpl,
    codeVm,
  });
  return { sandbox, fetchImpl };
}

async function startupSandbox(scopes: TurnGrantScope[]) {
  const boot = vi.fn(async () => fakeVm(async () => ({})).machine);
  const sandbox = createTurnSandbox({
    deps: { store, token: "", bootCodeVm: boot },
    turn: {
      workspaceId: "w1",
      agentId: "a1",
      conversationId: "c1",
      gcsPrefix: "ws/org/agent",
      hostToken: "host-secret",
      grant: grant(scopes),
    } as TurnRequest,
    identity: { org: "org", agent: "agent" },
    resolved: { store, prefix: "ws/org/agent" },
    filesystem: await filesystem(),
  });
  return { sandbox, boot };
}

const run = (
  call: ReturnType<typeof makeTurnSandboxFetch>["call"],
  body: unknown,
) =>
  call(TURN_CODE_RUN_PATH, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("code runs in the turn's VM, never through the gateway", async () => {
  const vm = fakeVm(async ({ files }) => {
    files.set(`${WORKDIR}/chart.png`, Buffer.from("png"));
    return { stdout: "42\n" };
  });
  const { sandbox, fetchImpl } = await facade(
    new TurnCodeVm(async () => vm.machine),
  );
  const response = await run(sandbox.call, {
    language: "python",
    code: "print(6*7)",
    files: [],
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ exitCode: 0, stdout: "42\n", timedOut: false });
  expect(body.artifacts).toEqual([
    { path: "chart.png", contentBase64: "cG5n", bytes: 3 },
  ]);
  expect(fetchImpl).not.toHaveBeenCalled();
  await sandbox.dispose();
  expect(vm.state.closed).toBe(true);
});

test("warmCode starts the boot before the first call", async () => {
  const boot = vi.fn(async () => fakeVm(async () => ({})).machine);
  const { sandbox } = await facade(new TurnCodeVm(boot));
  sandbox.warmCode();
  expect(boot).toHaveBeenCalledTimes(1);
  await sandbox.dispose();
});

test.each([
  ["not json", 400],
  [{ language: "fortran", code: "" }, 400],
  [
    {
      language: "bash",
      code: "true",
      files: [{ path: "/etc/x", contentBase64: "" }],
    },
    400,
  ],
])("a bad request comes back as a 400 with its reason: %#", async (body, status) => {
  const { sandbox } = await facade(
    new TurnCodeVm(async () => fakeVm(async () => ({})).machine),
  );
  const response = await run(sandbox.call, body);
  expect(response.status).toBe(status);
  expect((await response.json()).error).toEqual(expect.any(String));
  await sandbox.dispose();
});

test("a VM that cannot boot is a reported 502, not a crash", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const { sandbox } = await facade(
    new TurnCodeVm(async () => {
      throw new Error("no /dev/kvm");
    }),
  );
  const response = await run(sandbox.call, { language: "bash", code: "true" });
  expect(response.status).toBe(502);
  expect(report).toHaveBeenCalledWith(expect.stringContaining("no /dev/kvm"));
  await sandbox.dispose();
});

test("only a turn granted code-run gets a VM", async () => {
  const granted = await startupSandbox(["code-run"]);
  granted.sandbox?.warmCode();
  expect(granted.boot).toHaveBeenCalledTimes(1);
  await granted.sandbox?.dispose();
  const withheld = await startupSandbox(["integrations"]);
  withheld.sandbox?.warmCode();
  expect(withheld.boot).not.toHaveBeenCalled();
  await withheld.sandbox?.dispose();
});
