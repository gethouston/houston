import { expect, test } from "vitest";
import { ComposioProvider } from "./composio";
import { RemoteIntegrationProvider } from "./remote";

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function recorder(reply: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = reply(call);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const REQ = {
  action: "GMAIL_CREATE_EMAIL_DRAFT",
  toolkit: "gmail",
  filename: "q3.pdf",
  mimetype: "application/pdf",
  md5: "0123456789abcdef0123456789abcdef",
};

test("direct: describe reads the action at the execute version", async () => {
  const schema = { properties: { attachment: { file_uploadable: true } } };
  const { calls, fetchImpl } = recorder(() => ({
    body: {
      items: [
        {
          slug: "GMAIL_CREATE_EMAIL_DRAFT",
          toolkit: { slug: "gmail" },
          input_parameters: schema,
        },
      ],
    },
  }));
  const provider = new ComposioProvider({ apiKey: "k", fetch: fetchImpl });
  expect(
    await provider.describeAction("u1", "GMAIL_CREATE_EMAIL_DRAFT"),
  ).toEqual({
    action: "GMAIL_CREATE_EMAIL_DRAFT",
    toolkit: "gmail",
    inputParams: schema,
  });
  expect(calls[0]?.url.pathname).toBe("/api/v3/tools");
  expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
    tool_slugs: "GMAIL_CREATE_EMAIL_DRAFT",
    limit: "1",
    toolkit_versions: "latest",
  });
});

test("direct: reserve posts the SDK body and maps the slot", async () => {
  const { calls, fetchImpl } = recorder(() => ({
    body: {
      key: "projects/p/q3.pdf",
      new_presigned_url: "https://storage.example/put",
      metadata: { storage_backend: "azure_blob_storage" },
    },
  }));
  const provider = new ComposioProvider({ apiKey: "k", fetch: fetchImpl });
  expect(await provider.reserveFileUpload("u1", REQ)).toEqual({
    key: "projects/p/q3.pdf",
    uploadUrl: "https://storage.example/put",
    headers: {
      "Content-Type": "application/pdf",
      "x-ms-blob-type": "BlockBlob",
    },
  });
  expect(calls[0]?.method).toBe("POST");
  expect(calls[0]?.url.pathname).toBe("/api/v3.1/files/upload/request");
  expect(calls[0]?.body).toEqual({
    filename: "q3.pdf",
    mimetype: "application/pdf",
    md5: REQ.md5,
    tool_slug: "GMAIL_CREATE_EMAIL_DRAFT",
    toolkit_slug: "gmail",
  });
});

function remote(reply: (call: Call) => { status?: number; body?: unknown }) {
  const r = recorder(reply);
  const provider = new RemoteIntegrationProvider({
    id: "composio",
    upstreamUrl: "https://cloud.test",
    token: () => "session",
    fetch: r.fetchImpl,
  });
  return { ...r, provider };
}

test("remote: describe and reserve go to the gateway's file leg as the acting user", async () => {
  const { calls, provider } = remote((call) =>
    call.method === "GET"
      ? { body: { action: "GMAIL_X", toolkit: "gmail", inputParams: {} } }
      : { body: { key: "k", uploadUrl: "https://u", headers: {} } },
  );
  const acting = { actingAs: "turn-token" };
  await provider.describeAction("u1", "GMAIL_X", acting);
  await provider.reserveFileUpload("u1", REQ, acting);
  expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
    "GET /v1/integrations/composio/actions/GMAIL_X",
    "POST /v1/integrations/composio/files/upload-request",
  ]);
  expect(calls[1]?.body).toEqual({
    action: REQ.action,
    filename: REQ.filename,
    mimetype: REQ.mimetype,
    md5: REQ.md5,
  });
  expect(
    calls.every((c) => c.headers.authorization === "Bearer turn-token"),
  ).toBe(true);
});

test("remote: a gateway without the file leg (404) describes nothing", async () => {
  const { provider } = remote(() => ({
    status: 404,
    body: { error: "not found" },
  }));
  expect(await provider.describeAction("u1", "GMAIL_X")).toBeNull();
});
