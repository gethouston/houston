import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { ProxyChannel } from "../src/channel/proxy";
import { MemoryCredentialStore } from "../src/credentials/store";
import type {
  RuntimeEndpoint,
  RuntimeLauncher,
  TokenVerifier,
} from "../src/ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../src/server";
import { MemoryWorkspaceStore } from "../src/store/memory";
import { MemoryVfs, type Vfs } from "../src/vfs";

const verifier: TokenVerifier = {
  async verify(b) {
    return b.startsWith("tok:") ? { userId: b.slice(4) } : null;
  },
};
const launcher: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
    return { baseUrl: "http://unused", token: "t" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};
export const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
export const vfs = new MemoryVfs();

export const deps = (
  over: Partial<ControlPlaneDeps> = {},
): ControlPlaneDeps => ({
  verifier,
  store,
  credentials,
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {
    gke: new ProxyChannel({
      launcher,
      proxy: { async forward() {} },
      credentials,
      forwardActingHeader: false,
    }),
  },
  vfs,
  capabilities: CAPS,
  ...over,
});

export const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

export async function startAccountServer(
  over: Partial<ControlPlaneDeps> = {},
): Promise<{ base: string; close: () => Promise<void> }> {
  const server: Server = createControlPlaneServer(deps(over));
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const addr = server.address();
  return {
    base: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * A vfs whose reads answer with the state they saw when they started and only
 * then return. It widens the preference document's load, merge, save window so
 * a second, unserialized writer of a DIFFERENT key would save over the first
 * one's base.
 */
export function slowReadVfs(): Vfs {
  const inner = new MemoryVfs();
  return {
    keyCase: () => inner.keyCase(),
    exists: (key) => inner.exists(key),
    list: (prefix) => inner.list(prefix),
    listDetailed: (prefix) => inner.listDetailed(prefix),
    readText: async (key) => {
      const value = await inner.readText(key);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return value;
    },
    readBytes: (key) => inner.readBytes(key),
    writeText: (key, content) => inner.writeText(key, content),
    writeBytes: (key, content) => inner.writeBytes(key, content),
    deleteKey: (key) => inner.deleteKey(key),
    move: (from, to) => inner.move(from, to),
    deletePrefix: (prefix) => inner.deletePrefix(prefix),
  };
}
