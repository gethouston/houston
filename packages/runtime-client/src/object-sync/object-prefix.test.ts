import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import {
  InvalidObjectPrefixError,
  isObjectPrefix,
  underObjectPrefix,
} from "./object-prefix";

test.each([
  "",
  "skills",
  "skills/research",
  "workspaces/Personal/My Agent",
  ".houston",
])("pod-store accepts the prefix %j", (prefix) => {
  expect(isObjectPrefix(prefix)).toBe(true);
});

test.each([
  "skills/",
  "skills//",
  "skills//research",
  "/",
  "/skills",
  ".",
  "..",
  "../skills",
  "skills/../x",
  "skills/./x",
  "skills\\x",
  "skills\u0000",
  "skills\n",
  "skills\u0085",
  "a".repeat(1025),
])("pod-store refuses the prefix %j", (prefix) => {
  expect(isObjectPrefix(prefix)).toBe(false);
});

test("a prefix is a directory, never a fragment of a sibling's name", () => {
  expect(underObjectPrefix("skills/research/SKILL.md", "skills")).toBe(true);
  expect(underObjectPrefix("skills-old/research/SKILL.md", "skills")).toBe(
    false,
  );
  expect(underObjectPrefix("skillset.md", "skills")).toBe(false);
  expect(underObjectPrefix("anything", "")).toBe(true);
});

function podStore(keys: string[]) {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    const prefix = url.searchParams.get("prefix") ?? "";
    if (!isObjectPrefix(prefix)) {
      return Response.json({ error: "invalid object prefix" }, { status: 400 });
    }
    return Response.json({
      objects: keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, size: 1, md5: "m", updated: "u" })),
    });
  };
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/shared",
    token: "t",
    retryDelaysMs: [],
    fetchImpl,
  });
  return { store, urls };
}

test("the manifest asks for the directory and keeps only its keys", async () => {
  const { store, urls } = podStore([
    "skills/research/SKILL.md",
    "skills-old/research/SKILL.md",
    "skillset.md",
  ]);

  const listed = await store.manifest("skills");

  expect(urls).toEqual([
    "https://store.test/v1/pod/store/org/shared/manifest?prefix=skills",
  ]);
  expect(listed.map((object) => object.key)).toEqual([
    "skills/research/SKILL.md",
  ]);
});

test("a prefix pod-store would refuse never leaves the client", async () => {
  const { store, urls } = podStore(["skills/research/SKILL.md"]);

  await expect(store.manifest("skills/")).rejects.toBeInstanceOf(
    InvalidObjectPrefixError,
  );
  await expect(store.list("../skills")).rejects.toThrow(
    "invalid object prefix",
  );
  expect(urls).toEqual([]);
});
