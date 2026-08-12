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

test("a doc revision conflict is shadow-only", async () => {
  const shadow = new HttpDocShadow({
    gateway: {
      baseUrl: "https://store.example",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: {},
    },
    fetchImpl: vi.fn(async () => new Response("conflict", { status: 409 })),
  });

  await expect(shadow.put("activity", [])).resolves.toBeUndefined();
});
