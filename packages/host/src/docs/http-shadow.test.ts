import { expect, test, vi } from "vitest";
import { HttpDocShadow } from "./http-shadow";

test("doc shadow seeds and advances If-Match with fencing headers", async () => {
  const requests: RequestInit[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    if (!init?.method || init.method === "GET") {
      return Response.json({ doc: [], revision: 4 });
    }
    return Response.json({ revision: 5 });
  });
  const shadow = new HttpDocShadow({
    gateway: {
      baseUrl: "https://store.example",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: { token: "51" },
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  await shadow.seed();
  await shadow.put("learnings", [{ id: "l1" }]);

  const headers = new Headers(requests.at(-1)?.headers);
  expect(headers.get("if-match")).toBe("4");
  expect(headers.get("x-houston-fencing-token")).toBe("51");
  expect(headers.get("x-houston-boot-id")).toBe("boot-1");
  expect(requests.at(-1)?.body).toBe('{"doc":[{"id":"l1"}]}');
});

test("adopts a conflict revision and retries the PUT once", async () => {
  const requests: RequestInit[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    if (!init?.method) return Response.json({ doc: [], revision: 4 });
    if (requests.filter((request) => request.method === "PUT").length === 1) {
      return Response.json({ revision: 7 }, { status: 409 });
    }
    return Response.json({ revision: 8 });
  });
  const shadow = new HttpDocShadow({
    gateway: {
      baseUrl: "https://store.example",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: {},
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  await expect(shadow.put("activity", [])).resolves.toBeUndefined();

  const puts = requests.filter((request) => request.method === "PUT");
  expect(puts).toHaveLength(2);
  expect(new Headers(puts[0]?.headers).get("if-match")).toBe("4");
  expect(new Headers(puts[1]?.headers).get("if-match")).toBe("7");
});

test("a conflict without a revision clears the cache and lazily re-seeds", async () => {
  const requests: RequestInit[] = [];
  let getRevision = 4;
  let conflict = true;
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    if (!init?.method) return Response.json({ doc: [], revision: getRevision });
    if (conflict) {
      conflict = false;
      getRevision = 9;
      return new Response("conflict", { status: 409 });
    }
    return Response.json({ revision: 10 });
  });
  const shadow = new HttpDocShadow({
    gateway: {
      baseUrl: "https://store.example",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: {},
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  await shadow.put("activity", []);
  await shadow.put("activity", [{ id: "a1" }]);

  expect(requests.map((request) => request.method ?? "GET")).toEqual([
    "GET",
    "PUT",
    "GET",
    "PUT",
  ]);
  expect(new Headers(requests[3]?.headers).get("if-match")).toBe("9");
});

test("a failed boot seed stays unseeded and the next PUT lazily fetches", async () => {
  const requests: RequestInit[] = [];
  let bootSeeding = true;
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    if (bootSeeding) throw new Error("gateway unavailable");
    if (!init?.method) return Response.json({ doc: [], revision: 12 });
    return Response.json({ revision: 13 });
  });
  const shadow = new HttpDocShadow({
    gateway: {
      baseUrl: "https://store.example",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: {},
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  await shadow.seed();
  bootSeeding = false;
  await shadow.put("activity", []);

  const afterSeed = requests.slice(-2);
  expect(afterSeed.map((request) => request.method ?? "GET")).toEqual([
    "GET",
    "PUT",
  ]);
  expect(new Headers(afterSeed[1]?.headers).get("if-match")).toBe("12");
});
