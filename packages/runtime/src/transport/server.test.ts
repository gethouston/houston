import type { Server } from "node:http";
import { expect, test } from "vitest";
import { config } from "../config";
import { evict, publish } from "../session/bus";
import { holdTurnInFlight } from "../session/turn-inflight-count";
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

test("generate-agent without a description is a 400, not a model call", async () => {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  try {
    const res = await fetch(`${baseUrl}/generate-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({ description: "   " }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "missing 'description'",
    });
  } finally {
    await close(server);
  }
});

test("GET /busy answers from the turns in flight, without auth", async () => {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  const busy = async () => {
    const res = await fetch(`${baseUrl}/busy`);
    expect(res.status).toBe(200);
    return res.json();
  };
  let release = () => {};
  try {
    await expect(busy()).resolves.toEqual({
      busy: false,
      loginPending: false,
    });

    release = holdTurnInFlight();
    await expect(busy()).resolves.toEqual({
      busy: true,
      loginPending: false,
    });
    release();
    await expect(busy()).resolves.toEqual({
      busy: false,
      loginPending: false,
    });
  } finally {
    release();
    await close(server);
  }
});

test("GET /busy ignores a stream left reading running with no turn behind it", async () => {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  const conversationId = "server-busy-stale-stream";
  try {
    publish(conversationId, {
      type: "error",
      data: { message: "Stopped by user" },
      turnId: "t1",
    });
    publish(conversationId, {
      type: "usage",
      data: { context_tokens: 0, output_tokens: 0, cached_tokens: 0 },
      turnId: "t1",
    });
    const res = await fetch(`${baseUrl}/busy`);
    await expect(res.json()).resolves.toEqual({
      busy: false,
      loginPending: false,
    });
  } finally {
    evict(conversationId);
    await close(server);
  }
});

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
