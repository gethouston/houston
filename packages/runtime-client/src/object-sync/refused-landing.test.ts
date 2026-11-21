import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HttpObjectStore } from "./http-store";
import { landHttpBatch } from "./http-store-batch";
import { downloadFile } from "./http-store-download";
import { hydrate } from "./hydrate";
import { LocalDirStore } from "./object-store";
import { PrefetchedObjectStore } from "./prefetched-store";

const STATE = ".houston/browser/state.json";
const posixOnly = process.platform === "win32" ? describe.skip : describe;

function planted() {
  const dest = mkdtempSync(join(tmpdir(), "houston-refused-"));
  const catcher = mkdtempSync(join(tmpdir(), "houston-catch-"));
  mkdirSync(join(dest, ".houston"));
  symlinkSync(catcher, join(dest, ".houston/browser"));
  return { dest, catcher, state: join(dest, STATE) };
}

function frame(key: string, body: string) {
  const header = Buffer.from(
    JSON.stringify({ key, status: 200, size: Buffer.byteLength(body) }),
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, Buffer.from(body)]);
}

const OBJECTS: Record<string, string> = {
  "CLAUDE.md": "instructions",
  [STATE]: '{"cookies":[]}',
};

function httpStore(batchReads: boolean) {
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/manifest"))
      return Response.json({
        objects: Object.entries(OBJECTS).map(([key, body]) => ({
          key,
          size: body.length,
          md5: "m",
          updated: "2026-10-10T00:00:00Z",
        })),
      });
    if (path.endsWith("/batch")) {
      const { keys } = JSON.parse(String(init?.body)) as { keys: string[] };
      return new Response(
        Buffer.concat(keys.map((key) => frame(key, OBJECTS[key] ?? ""))),
      );
    }
    const key = decodeURIComponent(path.split("/objects/")[1] ?? "");
    return new Response(OBJECTS[key]);
  };
  return new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/agent",
    token: "t",
    fetchImpl,
    batchReads,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

posixOnly("a refused private directory", () => {
  test("each landing site answers a typed refusal, nothing lands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { catcher, state } = planted();
    expect(await downloadFile(new Response("{}"), STATE, state)).toEqual({
      refused: true,
    });
    const batch = await landHttpBatch(new Response(frame(STATE, "{}")), [
      { key: STATE, destFile: state },
    ]);
    expect(batch.get(STATE)).toEqual({ status: "refused" });
    const prefetched = () =>
      new PrefetchedObjectStore(new LocalDirStore(catcher), {
        manifest: [],
        objects: new Map([[STATE, { data: Buffer.from("{}") }]]),
      });
    expect(await prefetched().downloadVersioned(STATE, state)).toEqual({
      refused: true,
    });
    const many = await prefetched().downloadMany([
      { key: STATE, destFile: state },
    ]);
    expect(many.get(STATE)).toEqual({ status: "refused" });
    expect(readdirSync(catcher)).toEqual([]);
  });

  for (const [name, store] of [
    ["batched HTTP", () => httpStore(true)],
    ["one-by-one HTTP", () => httpStore(false)],
    [
      "local",
      () => {
        const root = mkdtempSync(join(tmpdir(), "houston-store-"));
        for (const [key, body] of Object.entries(OBJECTS)) {
          mkdirSync(join(root, key, ".."), { recursive: true });
          writeFileSync(join(root, key), body);
        }
        return new LocalDirStore(root);
      },
    ],
  ] as const)
    test(`a ${name} hydrate leaves the refused key out and goes on`, async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { dest, catcher } = planted();
      const manifest = await hydrate(store(), "", dest);
      expect([...manifest.keys()]).toEqual(["CLAUDE.md"]);
      expect(readdirSync(catcher)).toEqual([]);
      const skipped = error.mock.calls.filter((call) =>
        String(call[0]).includes(`hydrate left ${STATE} out`),
      );
      expect(skipped).toHaveLength(1);
    });
});
