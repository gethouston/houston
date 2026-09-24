import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { FilesCommand, FilesHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/**
 * An inert SDK (`reactivity:false`) over a mock `fetch` that records the whole
 * request and answers whatever the test queues.
 *
 * Every assertion is about the exact URL, method and body bytes that reach the
 * wire, because these routes are the agent's REAL workspace: a path escaped one
 * character differently reads or deletes a different file. Nothing is swallowed
 * either — the "no workspace here" degradations belong to the CALLER (the web
 * adapter's mixin), never to this module, or a caller would be handed an empty
 * listing it cannot tell from a real one.
 */
function makeSdk(respond: (url: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond(String(input));
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ENTRY = {
  path: "notes.md",
  name: "notes.md",
  extension: "md",
  size: 12,
  is_directory: false,
};

describe("files module — reading an agent's workspace", () => {
  it("lists the workspace off the agent's files route", async () => {
    const { sdk, calls } = makeSdk(() => json([ENTRY]));

    await expect(sdk.files.listProjectFiles("a 1")).resolves.toEqual([ENTRY]);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/agents/a%201/files`, body: null },
    ]);
  });

  it("escapes the read path into the query, separator by separator", async () => {
    const { sdk, calls } = makeSdk(() =>
      json({ content: "hi", base64: false }),
    );

    await expect(
      sdk.files.readProjectFile("a1", "sub dir/a&b.md"),
    ).resolves.toBe("hi");
    expect(calls[0].url).toBe(
      `${BASE}/agents/a1/files/read?path=sub%20dir%2Fa%26b.md`,
    );
  });

  it("decodes a base64-framed file to the bytes it carried", async () => {
    // The host frames anything it cannot serve as text as base64; a caller that
    // rendered the frame instead of the file would show mojibake.
    const { sdk } = makeSdk(() => json({ content: "SGVsbG8=", base64: true }));

    await expect(sdk.files.readProjectFile("a1", "logo.png")).resolves.toBe(
      "Hello",
    );
  });

  it("surfaces a non-2xx as a FilesHttpError carrying the status", async () => {
    const { sdk } = makeSdk(() => json({ error: "nope" }, 404));

    await expect(sdk.files.listProjectFiles("a1")).rejects.toMatchObject({
      name: "FilesHttpError",
      status: 404,
    });
    await expect(sdk.files.listProjectFiles("a1")).rejects.toBeInstanceOf(
      FilesHttpError,
    );
  });
});

describe("files module — rearranging a workspace", () => {
  it("deletes by query path, never by a path segment", async () => {
    const { sdk, calls } = makeSdk(() => json({}));

    await sdk.files.deleteFile("a1", "sub/old.md");
    expect(calls).toEqual([
      {
        method: "DELETE",
        url: `${BASE}/agents/a1/files?path=sub%2Fold.md`,
        body: null,
      },
    ]);
  });

  it("renames, creates a folder and moves with the host's body keys", async () => {
    const { sdk, calls } = makeSdk(() => json({ created: "notes" }));

    await sdk.files.renameFile("a1", "old.md", "new.md");
    await sdk.files.createFolder("a1", "notes");
    await sdk.files.moveProjectFile("a1", "old.md", null);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/agents/a1/files/rename`,
      `POST ${BASE}/agents/a1/files/folder`,
      `POST ${BASE}/agents/a1/files/move`,
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      JSON.stringify({ path: "old.md", newName: "new.md" }),
      JSON.stringify({ path: "notes" }),
      JSON.stringify({ path: "old.md", toDir: null }),
    ]);
  });
});

describe("files module — uploads take one already-framed batch", () => {
  const FRAMES = [
    { name: "a.txt", contentBase64: "YQ==", relPath: "folder/a.txt" },
    { name: "b.txt", contentBase64: "Yg==", relPath: undefined },
  ];

  it("imports a batch into a folder, the root riding as an explicit null", async () => {
    const { sdk, calls } = makeSdk(() => json({}));

    await sdk.files.uploadProjectFiles("a1", FRAMES);
    await sdk.files.uploadProjectFiles("a1", FRAMES, "docs");

    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/agents/a1/files/import`,
      `${BASE}/agents/a1/files/import`,
    ]);
    expect(calls[0].body).toBe(JSON.stringify({ dir: null, files: FRAMES }));
    expect(calls[1].body).toBe(JSON.stringify({ dir: "docs", files: FRAMES }));
  });

  it("posts composer attachments with the legacy scopeId and answers the paths", async () => {
    const { sdk, calls } = makeSdk(() => json({ paths: ["uploads/a.txt"] }));

    await expect(
      sdk.files.saveAttachments("a1", "conv-1", FRAMES),
    ).resolves.toEqual(["uploads/a.txt"]);
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/a1/attachments`,
        body: JSON.stringify({ scopeId: "conv-1", files: FRAMES }),
      },
    ]);
  });
});

describe("files module — the dispatch path", () => {
  it("runs the same request a facade call would", async () => {
    const { sdk, calls } = makeSdk(() => json([ENTRY]));

    const result = await sdk.dispatch({
      id: "1",
      type: FilesCommand.List,
      payload: { agentPath: "a1" },
    });

    expect(result).toEqual({ id: "1", ok: true, value: [ENTRY] });
    expect(calls[0].url).toBe(`${BASE}/agents/a1/files`);
  });

  it("refuses a malformed upload before a single byte is written", async () => {
    const { sdk, calls } = makeSdk(() => json({}));

    const result = await sdk.dispatch({
      id: "2",
      type: FilesCommand.Upload,
      payload: { agentPath: "a1", files: [{ name: "a.txt" }] },
    });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
