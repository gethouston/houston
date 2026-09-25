import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGACY_SETUP_BEGIN, LEGACY_SETUP_END } from "@houston/domain";
import { afterEach, beforeEach, expect, test } from "vitest";
import { sweepLegacySetupDirectives } from "./legacy-setup-directive";

/**
 * The boot sweep that removes the retired onboarding's "send ONE real email
 * now" section from every AI Employee's CLAUDE.md. What matters: only files
 * carrying the section are rewritten, the user's own text survives, a re-run
 * is a no-op, and a failure is reported rather than stopping the sweep.
 */

let root: string;
const noLog = () => {};

const SECTION = `${LEGACY_SETUP_BEGIN}\nSend ONE real email now.\n${LEGACY_SETUP_END}\n`;

function agent(ws: string, name: string, claudeMd: string | null): string {
  const dir = join(root, ws, name);
  mkdirSync(dir, { recursive: true });
  if (claudeMd !== null) writeFileSync(join(dir, "CLAUDE.md"), claudeMd);
  return dir;
}

const read = (dir: string) => readFileSync(join(dir, "CLAUDE.md"), "utf8");
const mtime = (dir: string) => statSync(join(dir, "CLAUDE.md")).mtimeMs;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "legacy-setup-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("strips the section from every workspace's agents, leaving clean files alone", () => {
  const dirty = agent("Personal", "Sales", `# Sales\n\nBe kind.\n\n${SECTION}`);
  const other = agent("Team", "Ops", `${SECTION}\n# Ops\n`);
  const clean = agent("Personal", "Clean", "# Clean\n");
  const cleanBefore = mtime(clean);
  agent("Personal", "NoFile", null);

  const result = sweepLegacySetupDirectives({
    workspacesRoot: root,
    log: noLog,
  });

  expect(result).toEqual({ sweptAgents: 2, failedAgents: 0 });
  expect(read(dirty)).toBe("# Sales\n\nBe kind.\n");
  expect(read(other)).toBe("# Ops\n");
  expect(read(clean)).toBe("# Clean\n");
  expect(mtime(clean)).toBe(cleanBefore);
  // The atomic write leaves no scratch file behind.
  expect(readdirSync(dirty)).toEqual(["CLAUDE.md"]);
});

test("a re-run is a no-op", () => {
  const dirty = agent("Personal", "Sales", `# Sales\n\n${SECTION}`);
  sweepLegacySetupDirectives({ workspacesRoot: root, log: noLog });
  const after = mtime(dirty);

  const again = sweepLegacySetupDirectives({
    workspacesRoot: root,
    log: noLog,
  });

  expect(again).toEqual({ sweptAgents: 0, failedAgents: 0 });
  expect(read(dirty)).toBe("# Sales\n");
  expect(mtime(dirty)).toBe(after);
});

test("an agent whose CLAUDE.md cannot be read is reported and the sweep goes on", () => {
  const broken = agent("Personal", "Broken", null);
  mkdirSync(join(broken, "CLAUDE.md"));
  const dirty = agent("Personal", "Sales", `# Sales\n\n${SECTION}`);
  const reported: string[] = [];

  const result = sweepLegacySetupDirectives({
    workspacesRoot: root,
    log: noLog,
    report: (agentRoot) => reported.push(agentRoot),
  });

  expect(result).toEqual({ sweptAgents: 1, failedAgents: 1 });
  expect(reported).toEqual([broken]);
  expect(read(dirty)).toBe("# Sales\n");
});

test("a missing workspaces tree sweeps nothing", () => {
  expect(
    sweepLegacySetupDirectives({
      workspacesRoot: join(root, "absent"),
      log: noLog,
    }),
  ).toEqual({ sweptAgents: 0, failedAgents: 0 });
});
