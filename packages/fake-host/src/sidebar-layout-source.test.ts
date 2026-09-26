import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The layout contract belongs to the protocol; the host's route module is one
// consumer of it, not a place the fake host borrows it from.
describe("fake host sidebar layout", () => {
  for (const [file, name] of [
    ["routes-integrations.ts", "parseSidebarLayout"],
    ["state-integrations.ts", "DEFAULT_SIDEBAR_LAYOUT"],
  ] as const) {
    it(`${file} takes ${name} from @houston/protocol`, () => {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/@houston\/host\/src\/routes\/sidebar-layout/);
      expect(source).toContain(`import { ${name} } from "@houston/protocol";`);
    });
  }
});
