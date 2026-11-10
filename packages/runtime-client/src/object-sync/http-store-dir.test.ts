import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { InvalidObjectPrefixError } from "./object-prefix";

const object = {
  key: "workspaces/W/CLAUDE.md",
  size: 2,
  md5: "",
  updated: "2026-11-10T00:00:00.000Z",
  gen: 7,
};

function storeAnswering(body: unknown) {
  const urls: string[] = [];
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/agent",
    token: "t",
    fetchImpl: (async (input: unknown) => {
      urls.push(String(input));
      return Response.json(body);
    }) as typeof fetch,
  });
  return { store, urls };
}

test("manifestDir asks pod-store for one level of the directory", async () => {
  const { store, urls } = storeAnswering({
    objects: [object],
    dirs: ["workspaces/W/A/"],
  });
  expect(await store.manifestDir("workspaces/W")).toEqual({
    objects: [
      {
        key: "workspaces/W/CLAUDE.md",
        size: 2,
        md5: "",
        updated: "2026-11-10T00:00:00.000Z",
        generation: "7",
      },
    ],
    dirs: ["workspaces/W/A"],
  });
  expect(urls).toEqual([
    "https://store.test/v1/pod/store/org/agent/manifest?prefix=workspaces%2FW&delimiter=%2F",
  ]);
});

test("the store root's level carries only the delimiter", async () => {
  const { store, urls } = storeAnswering({ objects: [], dirs: [] });
  await store.manifestDir("");
  expect(urls).toEqual([
    "https://store.test/v1/pod/store/org/agent/manifest?delimiter=%2F",
  ]);
});

test("a pod-store that predates the delimiter answers recursively: no level", async () => {
  const { store } = storeAnswering({ objects: [object] });
  expect(await store.manifestDir("workspaces")).toBeUndefined();
});

test("manifestDir refuses a prefix pod-store would refuse", async () => {
  const { store } = storeAnswering({ objects: [], dirs: [] });
  await expect(store.manifestDir("workspaces/")).rejects.toBeInstanceOf(
    InvalidObjectPrefixError,
  );
});
