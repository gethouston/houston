import type { ChatMessage } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { HttpTranscriptShadow } from "./http-shadow";

const message: ChatMessage = { role: "user", content: "hello", ts: 1 };

test("transcript writes carry pod auth, fencing, and learned revisions", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return Response.json({ revision: requests.length === 1 ? 7 : 8 });
  });
  const shadow = new HttpTranscriptShadow({
    gateway: {
      baseUrl: "https://store.example",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: { token: "41" },
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  await shadow.apply({
    kind: "user",
    conversationId: "c/1",
    turnId: "t1",
    message,
    title: "hello",
    expectedCount: 0,
  });
  await shadow.apply({
    kind: "truncate",
    conversationId: "c/1",
    turnId: "t1",
  });

  expect(requests[0]?.url).toContain(
    "/v1/pod/transcripts/acme/helper/conversations/c%2F1/turns/t1/user",
  );
  const headers = new Headers(requests[0]?.init?.headers);
  expect(headers.get("authorization")).toBe("Bearer pod-token");
  expect(headers.get("x-houston-fencing-token")).toBe("41");
  expect(headers.get("x-houston-boot-id")).toBe("boot-1");
  expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
    message,
    ts: 1,
    title: "hello",
    expectedCount: 0,
  });
  expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
    turnId: "t1",
    expectedRevision: 7,
  });
});

test("a 404 disables transcript shadow once for deploy skew", async () => {
  const fetchImpl = vi.fn(
    async () => new Response("old gateway", { status: 404 }),
  );
  const shadow = new HttpTranscriptShadow({
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

  await shadow.apply({
    kind: "assistant",
    conversationId: "c1",
    turnId: "t1",
    message: { ...message, role: "assistant" },
  });
  await shadow.apply({
    kind: "assistant",
    conversationId: "c1",
    turnId: "t2",
    message: { ...message, role: "assistant" },
  });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("reply-after preserves the assistant message body", async () => {
  const reply: ChatMessage = { role: "assistant", content: "done", ts: 12 };
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL) => {
    urls.push(String(url));
    return Response.json({ message: reply, found: true });
  });
  const shadow = new HttpTranscriptShadow({
    gateway: {
      baseUrl: "https://gateway.example/",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: {},
    },
    fetchImpl: fetchImpl as typeof fetch,
  });

  await expect(shadow.replyAfter("c1", 99)).resolves.toEqual(reply);
  expect(
    String(urls[0]).endsWith(
      "/v1/pod/transcripts/acme/helper/conversations/c1/reply-after?since=99",
    ),
  ).toBe(true);
});

test("reply-after rejects a malformed gateway message for file fallback", async () => {
  const shadow = new HttpTranscriptShadow({
    gateway: {
      baseUrl: "https://gateway.example/",
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: {},
    },
    fetchImpl: vi.fn(async () =>
      Response.json({ found: true, message: { role: "assistant" } }),
    ),
  });

  await expect(shadow.replyAfter("c1", 99)).rejects.toThrow("invalid message");
});
