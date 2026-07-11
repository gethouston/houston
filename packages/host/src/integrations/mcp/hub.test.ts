import { createServer, type Server } from "node:http";
import { afterEach, expect, test } from "vitest";
import { MemoryMcpAuthStore } from "./auth-store";
import { McpIntegrationProvider } from "./provider";

/**
 * The provider against a FAKE Composio hub: an MCP server exposing the meta
 * tool trio with live-shaped replies. Pins the hub personality end to end —
 * catalog listing, per-app connect/poll/disconnect, search translation, and
 * execute routing — all through the public IntegrationProvider surface.
 */

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

const reply = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify({ data, error: null }) }],
});

interface HubState {
  connected: Set<string>;
  manageCalls: unknown[];
}

async function fakeHubServer(state: HubState): Promise<string> {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      // The SDK's optional GET notification stream: refuse it, like a server
      // without one; DELETE session teardown gets the same shrug.
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const msg = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (msg.method === "notifications/initialized") {
      res.writeHead(202).end();
      return;
    }
    let result: unknown;
    if (msg.method === "initialize") {
      result = {
        protocolVersion: msg.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fake-hub", version: "1" },
      };
    } else if (msg.method === "tools/list") {
      result = {
        tools: [
          "COMPOSIO_MANAGE_CONNECTIONS",
          "COMPOSIO_SEARCH_TOOLS",
          "COMPOSIO_MULTI_EXECUTE_TOOL",
        ].map((name) => ({ name, inputSchema: { type: "object" } })),
      };
    } else if (msg.params.name === "COMPOSIO_MANAGE_CONNECTIONS") {
      state.manageCalls.push(msg.params.arguments);
      const results: Record<string, unknown> = {};
      for (const item of msg.params.arguments.toolkits) {
        if (item.action === "add") {
          results[item.name] = {
            toolkit: item.name,
            status: "initiated",
            redirect_url: `https://hub.test/link/${item.name}`,
          };
        } else if (item.action === "remove") {
          state.connected.delete(item.name);
          results[item.name] = { toolkit: item.name, status: "removed" };
        } else {
          results[item.name] = state.connected.has(item.name)
            ? {
                toolkit: item.name,
                status: "active",
                accounts: [{ id: `${item.name}_1`, status: "active" }],
              }
            : { toolkit: item.name, status: "initiated", accounts: [] };
        }
      }
      result = reply({ results });
    } else if (msg.params.name === "COMPOSIO_SEARCH_TOOLS") {
      result = reply({
        results: [
          {
            primary_tool_slugs: ["GMAIL_SEND_EMAIL", "SLACK_SEND_MESSAGE"],
            related_tool_slugs: ["SLACK_FIND_CHANNELS"],
          },
        ],
      });
    } else {
      const slug = msg.params.arguments.tools[0].tool_slug;
      result = reply({
        results: state.connected.has(slug.split("_")[0].toLowerCase())
          ? [
              {
                response: { successful: true, data: { ok: true } },
                tool_slug: slug,
              },
            ]
          : [
              {
                error: `No active connection found for toolkit(s) '${slug.split("_")[0].toLowerCase()}' in this session.`,
                tool_slug: slug,
              },
            ],
      });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}/mcp`;
}

function signedInProvider(url: string) {
  return new McpIntegrationProvider({
    id: "composio-apps",
    url,
    name: "Composio",
    redirectUrl: "http://127.0.0.1:1/cb",
    store: new MemoryMcpAuthStore({
      "composio-apps": { tokens: { access_token: "t", token_type: "Bearer" } },
    }),
  });
}

test("hub: toolkits = the server itself first, then the app catalog", async () => {
  const provider = signedInProvider(
    await fakeHubServer({ connected: new Set(), manageCalls: [] }),
  );
  const toolkits = await provider.listToolkits();
  expect(toolkits[0]).toMatchObject({
    slug: "composio-apps",
    name: "Composio",
  });
  expect(toolkits.length).toBeGreaterThan(20);
  expect(toolkits.map((t) => t.slug)).toContain("gmail");
  expect(toolkits.find((t) => t.slug === "gmail")?.logoUrl).toContain("gmail");
});

test("hub: connections = the hub plus its ACTIVE apps; connect/poll/disconnect an app", async () => {
  const state: HubState = { connected: new Set(["gmail"]), manageCalls: [] };
  const provider = signedInProvider(await fakeHubServer(state));

  expect(await provider.listConnections("u")).toEqual([
    {
      toolkit: "composio-apps",
      connectionId: "mcp:composio-apps",
      status: "active",
    },
    { toolkit: "gmail", connectionId: "app:gmail", status: "active" },
  ]);

  const start = await provider.connect("u", "slack");
  expect(start).toEqual({
    redirectUrl: "https://hub.test/link/slack",
    connectionId: "app:slack",
  });
  expect((await provider.connection("u", "app:slack"))?.status).toBe("pending");
  state.connected.add("slack");
  expect((await provider.connection("u", "app:slack"))?.status).toBe("active");

  await provider.disconnect("u", "gmail");
  const removes = state.manageCalls.filter((c) =>
    (c as { toolkits: { action: string }[] }).toolkits.some(
      (t) => t.action === "remove",
    ),
  );
  expect(removes).toHaveLength(1);
});

test("hub: search maps slugs to per-app matches with connect-card statuses", async () => {
  const provider = signedInProvider(
    await fakeHubServer({ connected: new Set(["gmail"]), manageCalls: [] }),
  );
  const items = await provider.search("u", "send messages");
  const bySlug = new Map(items.map((i) => [i.action, i]));
  expect(bySlug.get("GMAIL_SEND_EMAIL")).toMatchObject({
    toolkit: "gmail",
    status: "connected",
  });
  expect(bySlug.get("SLACK_SEND_MESSAGE")).toMatchObject({
    toolkit: "slack",
    status: "connectable",
  });
  // Toolkit-level row for the unconnected app teaches request_connection.
  expect(
    items.find((i) => i.action === "" && i.toolkit === "slack"),
  ).toBeTruthy();
});

test("hub: execute routes through the multi-executor; unconnected apps say so", async () => {
  const provider = signedInProvider(
    await fakeHubServer({ connected: new Set(["gmail"]), manageCalls: [] }),
  );
  expect(await provider.execute("u", "GMAIL_SEND_EMAIL", {})).toEqual({
    successful: true,
    data: { ok: true },
  });
  const failed = await provider.execute("u", "SLACK_SEND_MESSAGE", {});
  expect(failed.successful).toBe(false);
  expect(failed.error).toMatch(/not connected/i);
});
