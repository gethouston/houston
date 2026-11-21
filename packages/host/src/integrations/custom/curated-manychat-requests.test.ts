import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { MemoryCustomSecretStore } from "./secrets";
import type { CustomIntegrationDef } from "./types";

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}
const seen: Seen[] = [];

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
  });

const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/.well-known/")) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const raw = await readBody(req);
  seen.push({
    method: req.method ?? "",
    url: req.url ?? "",
    authorization: req.headers.authorization,
    body: raw ? JSON.parse(raw) : undefined,
  });
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  if (req.url?.startsWith("/fb/subscriber/findByName")) {
    res.end(
      JSON.stringify({
        status: "success",
        data: [{ id: 1001, name: "Ana Pérez", email: "ana@example.com" }],
      }),
    );
    return;
  }
  res.end(JSON.stringify({ status: "success" }));
});

let baseUrl = "";
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const SPEC = new URL(
  "../../../../../app/src/components/integrations/manychat-openapi.json",
  import.meta.url,
);

test("lookups go out as GETs with query params, writes as JSON POSTs, all bearer-signed", async () => {
  const secrets = new MemoryCustomSecretStore();
  await secrets.set("ci_manychat_token", "12345:s3cret");
  const def: CustomIntegrationDef = {
    kind: "openapi",
    slug: "manychat",
    name: "ManyChat",
    spec: { kind: "blob", value: readFileSync(SPEC, "utf8") },
    baseUrl,
    auth: "credential",
    addedAtMs: 1,
    credential: {
      template: "apikey-0",
      secretIds: { token: "ci_manychat_token" },
    },
  };
  const host = new CustomExecutorHost(secrets, async () => [def]);
  const { executor, states } = await host.ensure();
  expect(states.get("manychat")).toEqual({ status: "active", toolCount: 32 });
  const tools = await executor.tools.list();
  const address = (name: string) => {
    const tool = tools.find(
      (t) => t.integration === "manychat" && t.name === name,
    );
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.address;
  };

  const found = (await executor.execute(address("subscriber.findByName"), {
    name: "Ana Pérez",
  })) as { ok?: boolean; data?: unknown };
  await executor.execute(address("subscriber.addTagByName"), {
    body: { subscriber_id: 1001, tag_name: "vip" },
  });
  await executor.execute(address("sending.sendContent"), {
    body: {
      subscriber_id: 1001,
      data: {
        version: "v2",
        content: { messages: [{ type: "text", text: "Hola Ana" }] },
      },
      message_tag: "ACCOUNT_UPDATE",
    },
  });
  await host.reset();

  expect(seen.map((s) => [s.method, s.url.split("?")[0]])).toEqual([
    ["GET", "/fb/subscriber/findByName"],
    ["POST", "/fb/subscriber/addTagByName"],
    ["POST", "/fb/sending/sendContent"],
  ]);
  for (const call of seen) {
    expect(call.authorization).toBe("Bearer 12345:s3cret");
  }
  const lookup = new URL(seen[0]?.url ?? "", baseUrl);
  expect(lookup.searchParams.get("name")).toBe("Ana Pérez");
  expect(seen[0]?.body).toBeUndefined();
  expect(seen[1]?.body).toEqual({ subscriber_id: 1001, tag_name: "vip" });
  expect(seen[2]?.body).toEqual({
    subscriber_id: 1001,
    data: {
      version: "v2",
      content: { messages: [{ type: "text", text: "Hola Ana" }] },
    },
    message_tag: "ACCOUNT_UPDATE",
  });
  expect(JSON.stringify(found)).toContain("ana@example.com");
});
