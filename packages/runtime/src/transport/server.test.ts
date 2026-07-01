import type { Server } from "node:http";
import { expect, test } from "vitest";
import { config } from "../config";
import { createRuntimeServer } from "./server";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("test server did not bind a TCP port");
      }
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test("unknown conversation root methods return 404 instead of hanging", async () => {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  try {
    const res = await fetch(`${baseUrl}/conversations/missing`, {
      headers: config.token
        ? { Authorization: `Bearer ${config.token}` }
        : undefined,
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not found" });
  } finally {
    await close(server);
  }
});
