import type { Server } from "node:http";
import { expect, test, vi } from "vitest";
import { config } from "../config";
import {
  type CredentialScope,
  currentCredentialScope,
} from "../session/acting-context";

/**
 * EVERY runtime request must run inside the acting identity its headers carry
 * (HOU-976 §2.6.2), not just the message route: `/providers`, `/auth/status`,
 * `/auth/:p/login` and `/auth/export` all read or write a credential, and the
 * serve sync they trigger writes a credential FILE. The provider route stands in
 * for all of them here — the wrap is in one place, `createRuntimeServer`.
 */
const { seen } = vi.hoisted(() => ({
  seen: [] as unknown[],
}));
vi.mock("./provider-routes", () => ({
  handleProviderRoute: async (ctx: {
    path: string;
    res: { writeHead: (s: number) => void; end: (b?: string) => void };
  }) => {
    if (ctx.path !== "/providers") return false;
    // Captured from inside the request handler, where the credential store,
    // serve sync and health marks all resolve their scope.
    seen.push(currentCredentialScope());
    ctx.res.writeHead(200);
    ctx.res.end("{}");
    return true;
  },
}));

const { createRuntimeServer } = await import("./server");

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string")
        throw new Error("test server did not bind a TCP port");
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

test("the request's acting identity is the ambient credential scope for every route", async () => {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  const token = actingToken("sub-alice");
  try {
    const auth = config.token
      ? { Authorization: `Bearer ${config.token}` }
      : undefined;
    let res = await fetch(`${baseUrl}/providers`, {
      headers: { ...auth, "x-houston-acting-as": token },
    });
    expect(res.status).toBe(200);
    // Same route, no header: the team scope, exactly as before HOU-976.
    res = await fetch(`${baseUrl}/providers`, { headers: auth });
    expect(res.status).toBe(200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  expect(seen).toEqual([
    { key: "u:sub-alice", actingAs: token } satisfies CredentialScope,
    { key: "team" } satisfies CredentialScope,
  ]);
});
