import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("host boot documentation states present behavior", () => {
  const dir = new URL("./", import.meta.url);
  for (const name of readdirSync(dir).filter(
    (name) =>
      /^host(?:-|\.)/.test(name) &&
      name.endsWith(".ts") &&
      !name.endsWith(".test.ts"),
  )) {
    expect(
      readFileSync(new URL(name, dir), "utf8").includes("used to be"),
      name,
    ).toBe(false);
  }
});
