import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePreviewError } from "@houston/wire-types";
import { afterEach, expect, test, vi } from "vitest";
import { FsVfs } from "../vfs";
import { listWorkspace } from "./files";
import { serveFileDownload } from "./files-binary";
import { createOfficePreview } from "./files-office";
import { httpOfficeConverter } from "./office-converter";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return `http://127.0.0.1:${addr.port}`;
}
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "office-preview-host-"));
  cleanups.push(() => rm(home, { recursive: true, force: true }));
  const vfs = new FsVfs(join(home, "workspaces"));
  await vfs.writeBytes(
    "Work/Agent/deck.pptx",
    Buffer.from("first Office source"),
  );
  let version = "v1";
  let probes = 0;
  let refusal: string | null = null;
  const conversions: {
    bytes: Buffer;
    ext: string | null;
    lang: string | null;
  }[] = [];
  const service = await listen(
    createServer(async (req, res) => {
      if (req.url === "/health") {
        probes++;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ status: "ok", version }));
        return;
      }
      const url = new URL(req.url || "/", "http://converter");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      conversions.push({
        bytes: Buffer.concat(chunks),
        ext: url.searchParams.get("ext"),
        lang: url.searchParams.get("lang"),
      });
      if (refusal) {
        res.writeHead(refusal === "timeout" ? 504 : 422, {
          "content-type": "application/json",
        });
        res.end(JSON.stringify({ code: refusal }));
        return;
      }
      res.writeHead(200, {
        "content-type": "application/pdf",
        "x-page-count": "2",
        "x-converter-version": version,
      });
      res.write("%PDF-");
      res.end("converted");
    }),
  );
  const preview = createOfficePreview(
    join(home, "cache", "office-previews"),
    httpOfficeConverter(service),
  );
  const base = await listen(
    createServer((req, res) => {
      serveFileDownload(
        vfs,
        "Work/Agent",
        "Work/Agent",
        new URL(req.url || "/", "http://host").searchParams,
        res,
        preview,
      ).catch(() => {
        res.writeHead(500);
        res.end();
      });
    }),
  );
  return {
    probes: () => probes,
    home,
    vfs,
    preview,
    conversions,
    base,
    version: (value: string) => {
      version = value;
    },
    refusal: (value: string) => {
      refusal = value;
    },
    download: (query = "path=deck.pptx&as=pdf&lang=es-CO") =>
      fetch(`${base}/download?${query}`),
  };
}

test("cache miss, hit, locale, revision, and rewritten source all use authoritative bytes", async () => {
  const s = await setup();
  for (let i = 0; i < 2; i++) {
    const response = await s.download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-houston-page-count")).toBe("2");
    expect(await response.text()).toBe("%PDF-converted");
  }
  expect(s.conversions).toEqual([
    { bytes: Buffer.from("first Office source"), ext: "pptx", lang: "es" },
  ]);
  await s.vfs.writeBytes(
    "Work/Agent/deck.pptx",
    Buffer.from("rewritten Office source"),
  );
  await s.download();
  expect(s.conversions[1]?.bytes.toString()).toBe("rewritten Office source");
  await s.download("path=deck.pptx&as=pdf&lang=pt-BR");
  expect(s.conversions[2]?.lang).toBe("pt");
  expect(s.probes()).toBe(1);
  s.version("v2");
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 5 * 60_000 + 1);
  try {
    await s.download();
  } finally {
    clock.mockRestore();
  }
  expect(s.probes()).toBe(2);
  expect(s.conversions).toHaveLength(4);
  const entries = await listWorkspace(s.vfs, "Work/Agent");
  expect(entries.map((entry) => entry.path)).toEqual(["deck.pptx"]);
  const cached = await readdir(join(s.home, "cache", "office-previews"));
  expect(cached.filter((file) => file.endsWith(".pdf"))).toHaveLength(4);
  expect(cached.some((file) => file.includes("tmp"))).toBe(false);
  const original = await s.download("path=deck.pptx");
  expect(await original.text()).toBe("rewritten Office source");
  expect(original.headers.get("content-disposition")).toContain("deck.pptx");
  expect(s.conversions).toHaveLength(4);
  await s.vfs.deleteKey("Work/Agent/deck.pptx");
  expect((await s.download()).status).toBe(404);
  expect(s.conversions).toHaveLength(4);
});
test.each([
  ["timeout", 504],
  ["conversion_failed", 422],
] as const)("converter %s is a typed refusal", async (code, status) => {
  const s = await setup();
  s.refusal(code);
  const response = await s.download();
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({
    code,
    error: expect.any(String),
  });
});
test("unsupported and oversized inputs refuse before conversion", async () => {
  const s = await setup();
  await s.vfs.writeText("Work/Agent/file.txt", "text");
  const unsupported = await s.download("path=file.txt&as=pdf");
  expect(unsupported.status).toBe(415);
  expect(await unsupported.json()).toMatchObject({ code: "unsupported_type" });
  await s.vfs.writeBytes("Work/Agent/huge.pptx", Buffer.alloc(31_457_281));
  const large = await s.download("path=huge.pptx&as=pdf");
  expect(large.status).toBe(413);
  expect(await large.json()).toMatchObject({ code: "too_large" });
  expect(s.conversions).toHaveLength(0);
});
test("no configured converter returns conversion_unavailable, while originals are unchanged", async () => {
  const s = await setup();
  const base = await listen(
    createServer((req, res) => {
      serveFileDownload(
        s.vfs,
        "Work/Agent",
        "Work/Agent",
        new URL(req.url || "/", "http://host").searchParams,
        res,
      ).catch(() => {
        res.writeHead(500);
        res.end();
      });
    }),
  );
  const response = await fetch(`${base}/?path=deck.pptx&as=pdf`);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "conversion_unavailable",
  });
  expect(await (await fetch(`${base}/?path=deck.pptx`)).text()).toBe(
    "first Office source",
  );
});
test("transport failure is conversion_unavailable", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("offline"));
  try {
    await expect(
      httpOfficeConverter("http://converter").version(),
    ).rejects.toBeInstanceOf(FilePreviewError);
  } finally {
    request.mockRestore();
  }
});

test("equivalent and unknown locale tags share one converted cache entry", async () => {
  const s = await setup();
  for (const lang of ["en", "en-US", "unknown"]) {
    expect(
      (await s.download(`path=deck.pptx&as=pdf&lang=${lang}`)).status,
    ).toBe(200);
  }
  expect(s.conversions).toHaveLength(1);
  expect(s.conversions[0]?.lang).toBe("en");
  expect(s.probes()).toBe(1);
});

test.each([
  "html",
  "invalid-json",
  "broken-stream",
])("%s converter response becomes conversion_failed", async (kind) => {
  const response =
    kind === "broken-stream"
      ? new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("%PDF-"));
              controller.error(new Error("connection closed"));
            },
          }),
          { headers: { "x-page-count": "1", "x-converter-version": "v1" } },
        )
      : new Response(kind === "html" ? "<html>unavailable</html>" : "{", {
          status: 502,
        });
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);
  try {
    await expect(
      httpOfficeConverter("http://converter").convert(
        Buffer.from("source"),
        "pptx",
        "en",
      ),
    ).rejects.toMatchObject({ code: "conversion_failed" });
  } finally {
    request.mockRestore();
  }
});

test("the converter client reads a chunked PDF without Content-Length", async () => {
  const service = await listen(
    createServer((_req, res) => {
      res.writeHead(200, { "x-page-count": "2", "x-converter-version": "v1" });
      res.write("%PDF-");
      res.end("streamed");
    }),
  );
  const response = await fetch(service);
  expect(response.headers.get("content-length")).toBeNull();
  expect(response.headers.get("transfer-encoding")).toBe("chunked");
  await response.arrayBuffer();
  await expect(
    httpOfficeConverter(service).convert(Buffer.from("source"), "pptx", "en"),
  ).resolves.toEqual({
    pdf: Buffer.from("%PDF-streamed"),
    pageCount: 2,
    version: "v1",
  });
});
