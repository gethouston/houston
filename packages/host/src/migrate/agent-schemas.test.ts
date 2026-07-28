import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAMILIES, schemaDoc } from "@houston/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reseedAgentSchemas } from "./agent-schemas";

/**
 * The boot re-seed that brings EXISTING agents' schema files up to the build's
 * schemas. What matters: a stale copy is replaced (an agent created before
 * HOU-946 has a learnings schema with no provenance keys and
 * `additionalProperties: false`, which tells the model to strip them), an
 * already-current tree costs zero writes, and one bad agent never stops the rest.
 */

let root: string;
let agent: string;

const schemaPath = (agentRoot: string, family: string) =>
  join(agentRoot, ".houston", family, `${family}.schema.json`);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-schemas-"));
  agent = join(root, "Personal", "Alfred");
  mkdirSync(join(agent, ".houston"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("reseedAgentSchemas", () => {
  it("replaces a stale schema with the one this build ships", () => {
    const stale = JSON.stringify({ type: "array", items: {} });
    mkdirSync(join(agent, ".houston", "learnings"), { recursive: true });
    writeFileSync(schemaPath(agent, "learnings"), stale, "utf8");

    const result = reseedAgentSchemas({ workspacesRoot: root, log: () => {} });

    expect(result.updatedAgents).toBe(1);
    // Every family is (re-)seeded, so an agent that never had one gets it too.
    expect(result.updatedFiles).toBe(FAMILIES.length);
    const written = readFileSync(schemaPath(agent, "learnings"), "utf8");
    expect(written).toBe(schemaDoc("learnings"));
    // The whole point: the provenance keys are now describable by the model.
    expect(written).toContain("taught_by");
    expect(written).toContain("mission_id");
  });

  it("is a no-op the second time (content-compared, zero writes)", () => {
    reseedAgentSchemas({ workspacesRoot: root, log: () => {} });

    const again = reseedAgentSchemas({ workspacesRoot: root, log: () => {} });

    expect(again).toEqual({ updatedAgents: 0, updatedFiles: 0 });
  });

  it("skips directories that are not agents", () => {
    // A workspace folder with no `.houston` is not an agent tree — never create
    // one for it.
    mkdirSync(join(root, "Personal", "not-an-agent"), { recursive: true });

    reseedAgentSchemas({ workspacesRoot: root, log: () => {} });

    expect(existsSync(join(root, "Personal", "not-an-agent", ".houston"))).toBe(
      false,
    );
  });

  it("logs and continues when one agent cannot be written", () => {
    // A family path occupied by a FILE where the layout wants a directory: the
    // mkdir throws, and boot must survive it.
    const broken = join(root, "Personal", "Broken");
    mkdirSync(join(broken, ".houston"), { recursive: true });
    writeFileSync(join(broken, ".houston", FAMILIES[0] ?? ""), "junk", "utf8");
    const lines: string[] = [];

    const result = reseedAgentSchemas({
      workspacesRoot: root,
      log: (l) => lines.push(l),
    });

    // The healthy agent still got its schemas.
    expect(result.updatedAgents).toBe(1);
    expect(readFileSync(schemaPath(agent, "learnings"), "utf8")).toBe(
      schemaDoc("learnings"),
    );
    expect(lines.some((l) => l.includes("re-seed failed"))).toBe(true);
  });

  it("returns an empty result for a workspaces root that does not exist", () => {
    const result = reseedAgentSchemas({
      workspacesRoot: join(root, "nope"),
      log: () => {},
    });

    expect(result).toEqual({ updatedAgents: 0, updatedFiles: 0 });
  });
});
