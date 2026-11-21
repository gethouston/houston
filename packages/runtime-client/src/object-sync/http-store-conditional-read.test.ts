import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";

function store(answer: (headers: Headers) => Response) {
  const seen: Headers[] = [];
  const http = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/agent",
    token: "pod-token",
    fetchImpl: async (_input, init) => {
      const headers = new Headers(init?.headers);
      seen.push(headers);
      return answer(headers);
    },
  });
  return { http, seen };
}

const dest = () => join(mkdtempSync(join(tmpdir(), "conditional-read-")), "o");

test("an unchanged object answers not-modified and writes nothing", async () => {
  const { http, seen } = store(
    (headers) =>
      new Response(null, {
        status:
          headers.get("X-Houston-If-Generation-Not-Match") === "7" ? 304 : 200,
      }),
  );
  const file = dest();

  const read = await http.downloadVersioned("a/b.json", file, {
    ifGenerationNotMatch: "7",
  });

  expect(read).toEqual({ generation: "7", notModified: true });
  expect(existsSync(file)).toBe(false);
  expect(seen[0]?.get("X-Houston-If-Generation-Not-Match")).toBe("7");
});

test("a changed object, or a store that ignores the condition, is read in full", async () => {
  const { http } = store(
    () => new Response("fresh", { headers: { "X-Houston-Generation": "8" } }),
  );
  const file = dest();

  const read = await http.downloadVersioned("a/b.json", file, {
    ifGenerationNotMatch: "7",
  });

  expect(read).toEqual({ generation: "8" });
  expect(readFileSync(file, "utf8")).toBe("fresh");
});

test("a plain read sends no condition", async () => {
  const { http, seen } = store(() => new Response("x"));
  await http.downloadVersioned("a/b.json", dest());
  expect(seen[0]?.has("X-Houston-If-Generation-Not-Match")).toBe(false);
});
