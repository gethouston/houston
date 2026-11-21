import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { guardedFetch, sanitizeFetchInit } from "./fetch-guard";
import { MemoryCustomSecretStore } from "./secrets";
import type { CustomIntegrationDef } from "./types";

describe("sanitizeFetchInit", () => {
  test("strips content-length from every headers shape", () => {
    for (const headers of [
      { "content-length": "17", "x-api-key": "k" },
      [
        ["content-length", "17"],
        ["x-api-key", "k"],
      ] as [string, string][],
      new Headers([
        ["content-length", "17"],
        ["x-api-key", "k"],
      ]),
    ]) {
      const out = new Headers(sanitizeFetchInit({ headers })?.headers);
      expect(out.get("content-length")).toBeNull();
      expect(out.get("x-api-key")).toBe("k");
    }
  });

  test("strips hop-by-hop framing headers, keeps content-type and auth", () => {
    const out = new Headers(
      sanitizeFetchInit({
        headers: {
          "transfer-encoding": "chunked",
          connection: "keep-alive",
          host: "evil.example",
          "content-type": "application/json",
          authorization: "Bearer t",
        },
      })?.headers,
    );
    expect(out.get("transfer-encoding")).toBeNull();
    expect(out.get("connection")).toBeNull();
    expect(out.get("host")).toBeNull();
    expect(out.get("content-type")).toBe("application/json");
    expect(out.get("authorization")).toBe("Bearer t");
  });

  test("passes through inits without headers untouched", () => {
    expect(sanitizeFetchInit(undefined)).toBeUndefined();
    const init = { method: "POST" };
    expect(sanitizeFetchInit(init)).toBe(init);
  });
});

describe("guardedFetch under a duplicating fetch pipeline", () => {
  let server: Server;
  let base: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ rawHeaders: req.rawHeaders, body }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    globalThis.fetch = ((input, init) => {
      const headers = new Headers(init?.headers);
      const explicit = headers.get("content-length");
      if (explicit !== null) headers.append("content-length", explicit);
      return undiciFetch(
        input as never,
        {
          ...init,
          headers,
        } as never,
      ) as unknown as Promise<Response>;
    }) as typeof globalThis.fetch;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  test("an explicit content-length dies in this pipeline (the prod failure)", async () => {
    await expect(
      globalThis.fetch(`${base}/search`, {
        method: "POST",
        body: '{"prompt":"test"}',
        headers: { "content-length": "17" },
      }),
    ).rejects.toThrowError(/fetch failed/);
  });

  test("guardedFetch survives it and the server sees ONE valid length", async () => {
    const res = await guardedFetch(`${base}/search`, {
      method: "POST",
      body: '{"prompt":"test"}',
      headers: { "content-length": "17", "content-type": "application/json" },
    });
    const { rawHeaders, body } = (await res.json()) as {
      rawHeaders: string[];
      body: string;
    };
    expect(body).toBe('{"prompt":"test"}');
    const values = rawHeaders.flatMap((h, i) =>
      i % 2 === 0 && h.toLowerCase() === "content-length"
        ? [rawHeaders[i + 1]]
        : [],
    );
    expect(values).toEqual(["17"]);
  });
});

describe("guardedFetch with a Request-object input", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ rawHeaders: req.rawHeaders, body }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  test("input headers are sanitized and the body survives the clone", async () => {
    const request = new Request(`${base}/search`, {
      method: "POST",
      body: '{"prompt":"test"}',
      headers: {
        "content-type": "application/json",
        "x-api-key": "k",
        "transfer-encoding": "chunked",
      },
    });
    const res = await guardedFetch(request);
    const { rawHeaders, body } = (await res.json()) as {
      rawHeaders: string[];
      body: string;
    };
    expect(body).toBe('{"prompt":"test"}');
    const header = (name: string) =>
      rawHeaders.flatMap((h, i) =>
        i % 2 === 0 && h.toLowerCase() === name ? [rawHeaders[i + 1]] : [],
      );
    expect(header("x-api-key")).toEqual(["k"]);
    expect(header("transfer-encoding")).toEqual([]);
    expect(header("content-length")).toEqual(["17"]);
  });
});

describe("executor POST actions (HOU-1083 regression)", () => {
  let server: Server;
  let defs: CustomIntegrationDef[] = [];
  const host = new CustomExecutorHost(
    new MemoryCustomSecretStore(),
    async () => defs,
  );
  const requests: { method: string; url: string; rawHeaders: string[] }[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    globalThis.fetch = ((input, init) => {
      const headers = new Headers(init?.headers);
      const explicit = headers.get("content-length");
      if (explicit !== null) headers.append("content-length", explicit);
      return undiciFetch(
        input as never,
        {
          ...init,
          headers,
        } as never,
      ) as unknown as Promise<Response>;
    }) as typeof globalThis.fetch;
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        requests.push({
          method: req.method ?? "",
          url: req.url ?? "",
          rawHeaders: req.rawHeaders,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ echoed: body ? JSON.parse(body) : null }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    defs = [
      {
        kind: "openapi",
        slug: "posty",
        name: "Posty",
        auth: "none",
        addedAtMs: 0,
        spec: {
          kind: "blob",
          value: JSON.stringify({
            openapi: "3.0.3",
            info: { title: "Posty", version: "1.0.0" },
            servers: [{ url: `http://127.0.0.1:${port}/v1` }],
            paths: {
              "/search": {
                post: {
                  operationId: "search",
                  requestBody: {
                    required: true,
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            prompt: { type: "string" },
                            limit: { type: "integer" },
                          },
                          required: ["prompt"],
                        },
                      },
                    },
                  },
                  responses: { "200": { description: "ok" } },
                },
              },
            },
          }),
        },
      },
    ];
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await host.reset();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  test("a JSON POST action executes and the wire has one content-length", async () => {
    const { executor, states } = await host.ensure();
    expect(states.get("posty")).toEqual({ status: "active", toolCount: 1 });
    const tools = await executor.tools.list();
    const action = tools.find((t) => t.integration === "posty");
    if (!action) throw new Error("the posty action did not compile");
    const result = (await executor.execute(action.address, {
      body: { prompt: "test", limit: 1 },
    })) as { ok: boolean; data?: unknown };
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ echoed: { prompt: "test", limit: 1 } });
    const post = requests.find((r) => r.method === "POST");
    if (!post) throw new Error("the server never saw a POST");
    const lengths = post.rawHeaders.flatMap((h, i) =>
      i % 2 === 0 && h.toLowerCase() === "content-length"
        ? [post.rawHeaders[i + 1]]
        : [],
    );
    expect(lengths).toHaveLength(1);
    expect(lengths[0]).toMatch(/^\d+$/);
  });
});
