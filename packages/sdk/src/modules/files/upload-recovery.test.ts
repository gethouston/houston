import { expect, test, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import type { UploadInput, UploadProgress } from "./types";

const CHUNK = 8 * 1024 * 1024;
const RESULT = { written: 1, skipped: 0, rejected: [], sessionsRebuilt: false };
type Purpose = "attachment" | "files_import" | "migration_import";

function setup(
  purpose: Purpose,
  code: "upload_not_found" | "upload_incomplete",
  repeated = false,
) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const sinkRequests: Array<{
    id: string;
    range: string | null;
    bytes: number;
  }> = [];
  const progress: UploadProgress[] = [];
  const offsets = new Map<string, number>();
  const size = purpose === "migration_import" ? 3 : CHUNK + 3;
  let opens = 0;
  let commits = 0;
  const ports: SdkPorts = {
    fetch: vi.fn(async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/uploads")) {
        if (commits > 0) expect(progress.at(-1)?.phase).toBe("reconnecting");
        const id = `upload_session_${String(++opens).padStart(4, "0")}`;
        offsets.set(id, 0);
        return Response.json({
          uploadId: id,
          uploadUrl: `/sink/${id}`,
          chunkBytes: CHUNK,
          expiresAt: "2026-11-14T00:00:00Z",
        });
      }
      if (++commits === 1 || repeated) {
        if (code === "upload_incomplete") {
          const first = offsets.keys().next().value;
          if (first)
            offsets.set(first, purpose === "migration_import" ? 2 : CHUNK);
        }
        return Response.json(
          { error: code, code },
          { status: code === "upload_not_found" ? 404 : 409 },
        );
      }
      return Response.json(
        purpose === "migration_import"
          ? RESULT
          : {
              paths: [
                "uploads/file.bin",
                "uploads/inline.txt",
                "uploads/other.bin",
              ],
            },
      );
    }),
    rawFetch: vi.fn(async (url, init) => {
      const id = String(url).split("/").at(-1) ?? "";
      const range = new Headers(init?.headers).get("Content-Range");
      const body = await new Response(init?.body).arrayBuffer();
      sinkRequests.push({ id, range, bytes: body.byteLength });
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range ?? "");
      if (match) {
        expect(Number(match[1])).toBe(offsets.get(id));
        offsets.set(id, Number(match[2]) + 1);
      }
      const offset = offsets.get(id) ?? 0;
      return offset === size
        ? new Response(null)
        : new Response(null, {
            headers: {
              "X-HTTP-Status-Code-Override": "308",
              ...(offset ? { Range: `bytes=0-${offset - 1}` } : {}),
            },
          });
    }),
    random: () => 0,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: {
      now: () => 0,
      setTimeout: (fn) => {
        queueMicrotask(fn);
        return 1;
      },
      clearTimeout: vi.fn(),
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const sdk = new HoustonSdk({
    baseUrl: "https://host",
    reactivity: false,
    ports,
  });
  const bytes = new Uint8Array(size).fill(7);
  const file = {
    name: "file.bin",
    relPath: "folder/file.bin",
    blob: new Blob([bytes]),
  };
  const other = { name: "other.bin", blob: file.blob };
  const inputs = [file, { name: "inline.txt", contentBase64: "aGk=" }, other];
  const opts = {
    onProgress: (input: UploadInput, p: UploadProgress) => {
      if (input === file) progress.push(p);
    },
  };
  const run = () =>
    purpose === "attachment"
      ? sdk.files.saveAttachments("a", "conversation", inputs, opts)
      : purpose === "files_import"
        ? sdk.files.uploadProjectFiles("a", inputs, "docs", opts)
        : sdk.migration.importArchive("a", bytes.buffer, {
            overwrite: true,
            sessions: false,
            onProgress: (p) => progress.push(p),
          });
  return {
    run,
    requests,
    sinkRequests,
    progress,
    size,
    opens: () => opens,
    commits: () => commits,
  };
}

for (const purpose of [
  "attachment",
  "files_import",
  "migration_import",
] as const) {
  test.each([
    "upload_not_found",
    "upload_incomplete",
  ] as const)(`${purpose} recovers once from commit-time %s`, async (code) => {
    const s = setup(purpose, code);
    await s.run();
    expect(s.commits()).toBe(2);
    const stagedCount = purpose === "migration_import" ? 1 : 2;
    expect(s.opens()).toBe(
      code === "upload_not_found" ? 2 * stagedCount : stagedCount,
    );
    const commits = s.requests.filter(
      (request) => !request.url.endsWith("/uploads"),
    );
    expect(commits[1].url).toBe(commits[0].url);
    const first = JSON.parse(String(commits[0].init.body));
    const second = JSON.parse(String(commits[1].init.body));
    if (purpose === "migration_import") {
      expect(commits[1].url).toContain("?overwrite=1&sessions=0");
      expect(first.uploadId === second.uploadId).toBe(
        code === "upload_incomplete",
      );
    } else {
      expect(second.files[1]).toEqual(first.files[1]);
      expect(second.files[0].relPath).toBe("folder/file.bin");
      expect(second.files[0].uploadId === first.files[0].uploadId).toBe(
        code === "upload_incomplete",
      );
      expect(second.files[2].uploadId === first.files[2].uploadId).toBe(
        code === "upload_incomplete",
      );
      if (purpose === "attachment") expect(second.scopeId).toBe("conversation");
      else expect(second.dir).toBe("docs");
    }
    const firstSaving = s.progress.findIndex((p) => p.phase === "saving");
    const lastSaving = s.progress.map((p) => p.phase).lastIndexOf("saving");
    expect(lastSaving).toBeGreaterThan(firstSaving);
    expect(
      s.progress
        .slice(firstSaving + 1, lastSaving)
        .every((p) => p.phase === "reconnecting"),
    ).toBe(true);
    expect(
      s.progress.slice(firstSaving + 1, lastSaving).length,
    ).toBeGreaterThan(0);
    expect(s.progress.filter((p) => p.phase === "done")).toEqual([
      { sentBytes: s.size, totalBytes: s.size, phase: "done" },
    ]);
    if (code === "upload_incomplete") {
      const query = s.sinkRequests.findIndex(
        (request) => request.range === `bytes */${s.size}`,
      );
      expect(query).toBeGreaterThan(-1);
      expect(s.sinkRequests[query].bytes).toBe(0);
      expect(s.sinkRequests[query + 1].range).toBe(
        `bytes ${purpose === "migration_import" ? 2 : CHUNK}-${s.size - 1}/${s.size}`,
      );
    }
  });

  test.each([
    "upload_not_found",
    "upload_incomplete",
  ] as const)(`${purpose} surfaces a second commit-time %s`, async (code) => {
    const s = setup(purpose, code, true);
    await expect(s.run()).rejects.toMatchObject({
      name: "UploadRefusalError",
      code,
    });
    expect(s.commits()).toBe(2);
    expect(s.progress.some((p) => p.phase === "done")).toBe(false);
  });
}
