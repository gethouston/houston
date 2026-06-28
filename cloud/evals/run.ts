/**
 * Turn-quality evals against a live Houston control plane.
 *
 * For each canonical case (deck / spreadsheet / chart):
 *   create a throwaway agent → run ONE turn → download the artifact →
 *   structural validation → delete the agent.
 *
 * Usage:
 *   EVAL_CP_URL=https://app.gethouston.ai/api EVAL_TOKEN=<bearer> pnpm evals
 *
 * EVAL_TOKEN is any bearer the control plane accepts: a Supabase access token,
 * dev:<userId> against CP_DEV=1, or a CP_SERVICE_TOKENS entry (nightly CI).
 * Cases run sequentially (one turn per agent at a time is the platform
 * contract, and sequential runs keep quota + cost predictable).
 *
 * Output: human-readable summary to stdout, machine-readable JSON to
 * eval-results.json (override with EVAL_OUT). Exit 1 if any case fails.
 */
import { writeFile } from "node:fs/promises";
import { CASES } from "./cases";
import {
  type CpClient,
  createAgent,
  deleteAgent,
  downloadFile,
  listFiles,
  runTurn,
} from "./client";
import type { Check } from "./validators";

interface CaseResult {
  id: string;
  pass: boolean;
  turnOutcome: string;
  turnSeconds: number;
  events: number;
  artifactFound: boolean;
  artifactBytes: number;
  checks: Check[];
  error?: string;
}

const cp: CpClient = {
  baseUrl: (process.env.EVAL_CP_URL ?? "").replace(/\/+$/, ""),
  token: process.env.EVAL_TOKEN ?? "",
};
if (!cp.baseUrl || !cp.token) {
  console.error("EVAL_CP_URL and EVAL_TOKEN are required");
  process.exit(2);
}
const only = (process.env.EVAL_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const outPath = process.env.EVAL_OUT ?? "eval-results.json";

async function runCase(
  c: (typeof CASES)[number],
  stamp: string,
): Promise<CaseResult> {
  const result: CaseResult = {
    id: c.id,
    pass: false,
    turnOutcome: "not-run",
    turnSeconds: 0,
    events: 0,
    artifactFound: false,
    artifactBytes: 0,
    checks: [],
  };
  let agentId: string | null = null;
  try {
    const agent = await createAgent(cp, `eval-${c.id}-${stamp}`);
    agentId = agent.id;
    const started = Date.now();
    const turn = await runTurn(
      cp,
      agent.id,
      `eval-${c.id}`,
      c.prompt,
      c.timeoutSec,
    );
    result.turnSeconds = Math.round((Date.now() - started) / 1000);
    result.turnOutcome = turn.outcome;
    result.events = turn.events;
    if (turn.outcome === "error") {
      result.error = turn.errorMessage ?? "turn errored";
      return result;
    }

    // The turn syncs the workspace back before its terminal frame, but give
    // listing a few retries to absorb eventual consistency.
    let bytes: Uint8Array | null = null;
    for (let attempt = 0; attempt < 6 && !bytes; attempt++) {
      const files = await listFiles(cp, agent.id);
      const hit = files.find((f) => !f.is_directory && f.path === c.artifact);
      if (hit) {
        bytes = await downloadFile(cp, agent.id, c.artifact);
      } else if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
    if (!bytes) {
      result.error = `artifact ${c.artifact} not found in workspace after turn`;
      return result;
    }
    result.artifactFound = true;
    result.artifactBytes = bytes.length;
    result.checks = await c.validate(bytes);
    result.pass = result.checks.every((ch) => ch.pass);
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  } finally {
    if (agentId) {
      // Cleanup is part of the eval: orphaned eval agents are cost + clutter.
      await deleteAgent(cp, agentId).catch((err) => {
        console.error(
          `  cleanup failed for ${agentId}: ${err instanceof Error ? err.message : err}`,
        );
        result.error = result.error ?? `cleanup failed: ${String(err)}`;
      });
    }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const selected = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
const results: CaseResult[] = [];

console.log(`Houston evals → ${cp.baseUrl} (${selected.length} cases)\n`);
for (const c of selected) {
  console.log(`▶ ${c.id}: ${c.prompt.slice(0, 80)}…`);
  const r = await runCase(c, stamp);
  results.push(r);
  const verdict = r.pass ? "PASS" : "FAIL";
  console.log(
    `  ${verdict} — turn=${r.turnOutcome} in ${r.turnSeconds}s, artifact=${r.artifactBytes}b`,
  );
  for (const ch of r.checks) {
    console.log(
      `    ${ch.pass ? "✓" : "✗"} ${ch.name}${ch.detail ? ` (${ch.detail})` : ""}`,
    );
  }
  if (r.error) console.log(`    error: ${r.error}`);
  console.log("");
}

const passed = results.filter((r) => r.pass).length;
const summary = {
  timestamp: new Date().toISOString(),
  target: cp.baseUrl,
  passed,
  total: results.length,
  results,
};
await writeFile(outPath, JSON.stringify(summary, null, 2));
console.log(`${passed}/${results.length} passed — wrote ${outPath}`);
process.exit(passed === results.length ? 0 : 1);
