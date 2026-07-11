import { createServer, type Server } from "node:http";
import { afterEach, expect, test } from "vitest";
import { MemoryMcpAuthStore } from "./auth-store";
import { McpIntegrationProvider } from "./provider";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function fakeMcpServer(): Promise<string> {
  const server = createServer(async (req, res) => {
    if (req.method === "GET") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (message.method === "notifications/initialized") {
      res.writeHead(202).end();
      return;
    }
    let result: unknown;
    if (message.method === "initialize") {
      result = {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fake-mcp", version: "1.0.0" },
      };
    } else if (message.method === "tools/list") {
      result = {
        tools: [
          {
            name: "echo_message",
            description: "Echo a message",
            inputSchema: {
              type: "object",
              properties: { message: { type: "string" } },
            },
          },
          ...Array.from({ length: 10 }, (_, index) => ({
            name: `echo_extra_${index}`,
            description: "Echo extra content",
            inputSchema: { type: "object" },
          })),
          {
            name: "fail_action",
            description: "Return an error",
            inputSchema: { type: "object" },
          },
        ],
      };
    } else if (message.method === "tools/call") {
      const failed = message.params.name === "fail_action";
      result = {
        content: [
          {
            type: "text",
            text: failed
              ? "expected failure"
              : message.params.arguments.message,
          },
        ],
        isError: failed,
      };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/mcp`;
}

function provider(url: string, store: MemoryMcpAuthStore) {
  return new McpIntegrationProvider({
    id: "fake",
    url,
    redirectUrl: "http://127.0.0.1/callback",
    store,
  });
}

test("signed-out search returns one connectable toolkit match", async () => {
  const match = await provider(
    "http://127.0.0.1:1/mcp",
    new MemoryMcpAuthStore(),
  ).search("user", "echo");
  expect(match).toEqual([
    {
      action: "",
      toolkit: "fake",
      description: "Remote MCP server (127.0.0.1)",
      connected: false,
      status: "connectable",
    },
  ]);
});

test("maps MCP tools and successful/error calls", async () => {
  const url = await fakeMcpServer();
  const store = new MemoryMcpAuthStore({
    fake: { tokens: { access_token: "seeded", token_type: "bearer" } },
  });
  const mcp = provider(url, store);

  const matches = await mcp.search("user", "echo message");
  expect(matches).toHaveLength(10);
  expect(matches[0]).toEqual({
    action: "echo_message",
    toolkit: "fake",
    description: "Echo a message",
    inputParams: {
      type: "object",
      properties: { message: { type: "string" } },
    },
    connected: true,
    status: "connected",
  });
  expect(
    await mcp.execute("user", "echo_message", { message: "hello" }),
  ).toEqual({ successful: true, data: "hello" });
  expect(await mcp.execute("user", "fail_action", {})).toEqual({
    successful: false,
    data: "expected failure",
    error: "expected failure",
  });
  await mcp.disconnect("user", "fake");
});
