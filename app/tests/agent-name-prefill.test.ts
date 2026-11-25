import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { prefilledAgentName } from "../src/lib/agent-name-prefill.ts";
import { AGENT_NAME_MAX_LENGTH } from "../src/lib/agent-name.ts";

describe("prefilledAgentName", () => {
  it("names a new hire for its job, trimmed", () => {
    strictEqual(prefilledAgentName("  Chief of Staff ", []), "Chief of Staff");
  });

  it("numbers a job name someone already goes by, ignoring case", () => {
    strictEqual(
      prefilledAgentName("Chief of Staff", ["chief of staff"]),
      "Chief of Staff 2",
    );
    strictEqual(
      prefilledAgentName("Chief of Staff", [
        "Chief of Staff",
        "Chief of Staff 2",
      ]),
      "Chief of Staff 3",
    );
  });

  it("cuts a typed job to a name's length, numbered within it too", () => {
    const long = "Head of customer happiness ".repeat(4);
    const name = prefilledAgentName(long, []);
    strictEqual(name.length <= AGENT_NAME_MAX_LENGTH, true);
    strictEqual(name, name.trim());
    strictEqual(long.startsWith(name), true);
    const numbered = prefilledAgentName(long, [name]);
    strictEqual(numbered.length <= AGENT_NAME_MAX_LENGTH, true);
    strictEqual(numbered.endsWith(" 2"), true);
  });

  it("never splits a character when it cuts", () => {
    // Each face is two UTF-16 units: 32 of them fill the 64 whole.
    strictEqual(prefilledAgentName("😀".repeat(40), []), "😀".repeat(32));
    strictEqual(
      prefilledAgentName(`a${"😀".repeat(40)}`, []),
      `a${"😀".repeat(31)}`,
    );
  });

  it("leaves the name blank for a job the host refuses as a name", () => {
    strictEqual(prefilledAgentName("Sales/Marketing", []), "");
    strictEqual(prefilledAgentName(".hidden", []), "");
    strictEqual(prefilledAgentName("   ", []), "");
  });
});
