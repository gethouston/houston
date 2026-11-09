import { watch } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { FilePreviewError } from "@houston/wire-types/file-preview";
import { afterEach, expect, test, vi } from "vitest";
import { conversionLocale, pdfFilter, runOffice } from "./convert";
import { createConverterServer } from "./server";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});
async function listen(
  options: Parameters<typeof createConverterServer>[0] = {},
) {
  const server = createConverterServer({ version: "test-v1", ...options });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("missing address");
  return `http://127.0.0.1:${addr.port}`;
}
const post = (base: string, query = "ext=pptx&lang=es-CO", body = "office") =>
  fetch(`${base}/convert?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });

test("health reports the revision, and unknown routes return 404", async () => {
  const base = await listen();
  const health = await fetch(`${base}/health`);
  expect(await health.json()).toEqual({ status: "ok", version: "test-v1" });
  expect(health.headers.get("x-converter-version")).toBe("test-v1");
  expect((await fetch(`${base}/other`)).status).toBe(404);
});
test("conversion passes the exact source, extension, and locale, then returns a PDF and page count", async () => {
  const convert = vi.fn(async () => ({
    pdf: Buffer.from("%PDF-test"),
    pageCount: 3,
  }));
  const res = await post(await listen({ convert }));
  expect(convert).toHaveBeenCalledWith(Buffer.from("office"), "pptx", "es-CO");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  expect(res.headers.get("x-page-count")).toBe("3");
  expect(res.headers.get("x-converter-version")).toBe("test-v1");
  expect(await res.text()).toBe("%PDF-test");
});
test("unsupported types and oversized bodies never reach LibreOffice", async () => {
  const convert = vi.fn();
  const base = await listen({ convert, maxBytes: 4 });
  const unsupported = await post(base, "ext=exe");
  expect(unsupported.status).toBe(415);
  expect(await unsupported.json()).toEqual({ code: "unsupported_type" });
  const large = await post(base);
  expect(large.status).toBe(413);
  expect(await large.json()).toEqual({ code: "too_large" });
  expect(convert).not.toHaveBeenCalled();
});
test.each([
  ["timeout", 504],
  ["conversion_failed", 422],
] as const)("%s keeps its HTTP status", async (code, status) => {
  const report = vi.fn();
  const res = await post(
    await listen({
      convert: async () => {
        throw new FilePreviewError(code, "failed");
      },
      report,
    }),
  );
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ code });
  expect(report).toHaveBeenCalledOnce();
});
test("locales use only generated values", () => {
  expect(conversionLocale("es-CO")).toBe("es_ES.UTF-8");
  expect(conversionLocale("pt-BR")).toBe("pt_BR.UTF-8");
  expect(conversionLocale("zh-CN")).toBe("en_US.UTF-8");
  expect(conversionLocale("es;command")).toBe("en_US.UTF-8");
});
test("presentation and sheet exports preserve their page identities", () => {
  expect(pdfFilter("pptx")).toContain(
    '"ExportHiddenSlides":{"type":"boolean","value":"true"}',
  );
  expect(pdfFilter("ods")).toContain(
    '"SinglePageSheets":{"type":"boolean","value":"true"}',
  );
  expect(pdfFilter("docx")).toBe("pdf");
});
test("a real child with a nonzero exit refuses conversion", async () => {
  await expect(
    runOffice(["-c", "exit 7"], "/tmp", "en", 30_000, "/bin/sh"),
  ).rejects.toMatchObject({ code: "conversion_failed" });
});
test("timeout terminates a real process group", async () => {
  const work = await mkdtemp(join(tmpdir(), "office-group-"));
  const pidFile = join(work, "grandchild.pid");
  let pid: number | undefined;
  const watcher = watch(work);
  const ready = new Promise<number>((resolve, reject) => {
    watcher.on("error", reject);
    watcher.on("change", () => {
      readFile(pidFile, "utf8").then(
        (value) => resolve(Number(value)),
        (error) => {
          if (
            !(
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            )
          )
            reject(error);
        },
      );
    });
  });
  vi.useFakeTimers();
  const finished = expect(
    runOffice(
      [
        "-c",
        'sleep 100 & echo $! > "$1.tmp"; mv "$1.tmp" "$1"; wait',
        "--",
        pidFile,
      ],
      work,
      "en",
      30_000,
      "/bin/sh",
    ),
  ).rejects.toMatchObject({ code: "timeout" });
  try {
    pid = await ready;
    expect(pid).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(30_000);
    await finished;
    vi.useRealTimers();
    // The parent's exit event can precede the descendant's removal from the process table.
    const deadline = Date.now() + 1_000;
    for (;;) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        expect(error).toMatchObject({ code: "ESRCH" });
        break;
      }
      expect(Date.now()).toBeLessThan(deadline);
      await setImmediate();
    }
    expect(() => process.kill(pid ?? 0, 0)).toThrowError(
      expect.objectContaining({ code: "ESRCH" }),
    );
  } finally {
    vi.useRealTimers();
    watcher.close();
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        expect(error).toMatchObject({ code: "ESRCH" });
      }
    }
    await rm(work, { recursive: true, force: true });
  }
});

test("chunked uploads enforce the size cap without a Content-Length", async () => {
  const convert = vi.fn();
  const base = await listen({ convert, maxBytes: 4 });
  const response = await new Promise<{
    status: number | undefined;
    body: string;
  }>((resolve, reject) => {
    const req = request(
      `${base}/convert?ext=pptx`,
      {
        method: "POST",
        headers: { "Transfer-Encoding": "chunked" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end("oversized");
  });
  expect(response.status).toBe(413);
  expect(JSON.parse(response.body)).toEqual({ code: "too_large" });
  expect(convert).not.toHaveBeenCalled();
});
