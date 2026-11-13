import { RESUMABLE_UPLOAD_THRESHOLD_BYTES } from "@houston/wire-types";
import { expect, test, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const session = {
  uploadId: "upload_session_0001",
  uploadUrl: "/sink",
  chunkBytes: 8 * 1024 * 1024,
  expiresAt: "2026-11-14T00:00:00Z",
};
const result = { written: 1, skipped: 0, rejected: [], sessionsRebuilt: false };

test.each([
  "attachment",
  "files_import",
  "migration_import",
] as const)("%s falls back on temporary open refusals for one call only", async (purpose) => {
  for (const status of [429, 503]) {
    const commits: RequestInit[] = [];
    let opens = 0;
    const ports: SdkPorts = {
      fetch: vi.fn(async (url, init) => {
        if (String(url).endsWith("/uploads")) {
          if (++opens === 1)
            return Response.json(
              {
                error: "busy",
                ...(status === 429 ? { code: "too_many_uploads" } : {}),
              },
              { status },
            );
          return Response.json(session);
        }
        commits.push(init ?? {});
        return Response.json(
          purpose === "migration_import"
            ? result
            : { paths: ["uploads/file.bin"] },
        );
      }),
      rawFetch: vi.fn(async (_url, init) => {
        const range = new Headers(init?.headers).get("Content-Range");
        if (range?.startsWith("bytes 0-") && purpose !== "migration_import")
          return new Response(null, {
            headers: {
              "X-HTTP-Status-Code-Override": "308",
              Range: `bytes=0-${session.chunkBytes - 1}`,
            },
          });
        return new Response(null);
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
    const bytes = new Uint8Array(
      purpose === "migration_import" ? 3 : RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1,
    ).fill(7);
    const file = { name: "file.bin", blob: new Blob([bytes]) };
    const run = () =>
      purpose === "attachment"
        ? sdk.files.saveAttachments("a", "c", [file])
        : purpose === "files_import"
          ? sdk.files.uploadProjectFiles("a", [file])
          : sdk.migration.importArchive("a", bytes.buffer);
    await run();
    await run();
    expect(opens).toBe(2);
    expect(commits).toHaveLength(2);
    if (purpose === "migration_import") {
      expect(commits[0].body).toBe(bytes.buffer);
      expect(new Headers(commits[0].headers).get("Content-Type")).toBe(
        "application/zip",
      );
      expect(JSON.parse(String(commits[1].body))).toEqual({
        uploadId: session.uploadId,
      });
    } else {
      expect(JSON.parse(String(commits[0].body)).files[0].contentBase64).toBe(
        Buffer.from(bytes).toString("base64"),
      );
      expect(JSON.parse(String(commits[1].body)).files[0]).toEqual({
        name: file.name,
        uploadId: session.uploadId,
      });
    }
  }
});
