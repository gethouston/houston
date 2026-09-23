import { expect, test } from "vitest";
import { normalizeSource } from "./github-source";

// Ported from the Rust oracle (HOU-440).

test("normalizeSource accepts urls, ssh, and pasted commands", () => {
  expect(normalizeSource("owner/repo")).toBe("owner/repo");
  expect(normalizeSource("https://github.com/owner/repo")).toBe("owner/repo");
  expect(normalizeSource("https://github.com/owner/repo/tree/main")).toBe(
    "owner/repo",
  );
  expect(normalizeSource("https://github.com/owner/repo.git")).toBe(
    "owner/repo",
  );
  expect(normalizeSource("https://github.com/owner/repo?tab=readme")).toBe(
    "owner/repo",
  );
  expect(normalizeSource("git@github.com:owner/repo.git")).toBe("owner/repo");
  expect(normalizeSource("  owner/repo  ")).toBe("owner/repo");
  expect(normalizeSource('"owner/repo"')).toBe("owner/repo");
  expect(
    normalizeSource(
      "gh repo clone https://github.com/shadcn/improve --depth 1",
    ),
  ).toBe("shadcn/improve");
});

test("normalizeSource rejects unparseable input", () => {
  expect(normalizeSource("reconciliation")).toBeNull();
  expect(normalizeSource("please install my agent for me")).toBeNull();
  expect(normalizeSource("")).toBeNull();
  expect(normalizeSource("@owner/repo!")).toBeNull();
  expect(normalizeSource("my_org/repo")).toBeNull();
});
