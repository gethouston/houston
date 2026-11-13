import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { buildLocalHost } from "./host";

test.each([
  "desktop",
  "self-host",
  "pooled",
  "standing",
])("%s serves upload sessions only when uploads terminate at this host", async (deployment) => {
  const home = await mkdtemp(join(tmpdir(), "host-upload-profile-"));
  await mkdir(join(home, "workspaces/main/agent"), { recursive: true });
  const managed = deployment === "pooled" || deployment === "standing";
  const host = buildLocalHost({
    houstonHome: home,
    workspacesRoot: join(home, "workspaces"),
    credentialsPath: join(home, "credentials.json"),
    port: 0,
    token: "test-token",
    runtimeCommand: ["true"],
    passive: true,
    gatewayFronted: managed,
    storeSync:
      deployment === "pooled"
        ? { store: new LocalDirStore(join(home, "remote")) }
        : undefined,
  });
  try {
    await host.start();
    const address = host.server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/agents/main%2Fagent/uploads`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "x", size: 1, purpose: "attachment" }),
    });
    expect(response.status).toBe(managed ? 404 : 200);
    if (managed) {
      const sink = await fetch(`${base}/v1/uploads/opaque_upload_id_123`, {
        method: "PUT",
        headers: { "Content-Range": "bytes */1" },
      });
      expect(sink.status).toBe(404);
    }
  } finally {
    await host.stop();
    await rm(home, { recursive: true, force: true });
  }
});
