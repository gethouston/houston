import type {
  PortableScanFinding,
  PortableScanItem,
  PortableScanResponse,
} from "@houston/protocol";
import type { PortableContent } from "./portable";

/**
 * Heuristic threat scan for uploaded portable agent packages — the TS port
 * of the Rust engine's `portable/scan.rs`, behavior-preserving.
 *
 * V1 is pattern-based. Categories mirror the wire contract the UI renders:
 * each finding shows up next to the offending item with a severity badge
 * and a short reason. An LLM-driven scan is the v2 upgrade — same API.
 *
 * Calibration is intentionally noisy on the side of caution. The UI frames
 * results as "Houston reviewed, here's what stood out", not "Safe ✓".
 * False positives are recoverable (the user can dismiss); false negatives
 * are not.
 */

const DISCLAIMER =
  "Houston reviewed this package automatically. The review may have missed concerns. Open anything that looks unusual before installing.";

const EXFIL_SENSITIVE_PATH =
  /(\.ssh\/|\.aws\/|\.npmrc|\.netrc|\.env|id_rsa|id_ed25519|\/etc\/shadow|\/etc\/passwd|keychain)/;

const PROMPT_INJECTION_NEEDLES = [
  "ignore previous instructions",
  "ignore all instructions",
  "ignore above instructions",
  "ignore prior instructions",
  "disregard your instructions",
  "disregard all instructions",
  "do not tell the user",
  "system prompt override",
  "you are now",
  "act as a different",
];

const TOOL_ABUSE_NEEDLES = [
  "disable safety",
  "skip confirmation",
  "without asking",
  "no need to confirm",
  "bypass review",
  "auto-approve",
  "never ask",
];

const SUSPICIOUS_SHELL =
  /(rm\s+-rf\s+\/|:\(\)\{\s*:\|:|chmod\s+777|sudo\s+rm|>\s*\/dev\/sda|mkfs\.|dd\s+if=|curl\s+[^|]*\|\s*(sh|bash))/i;

const OUTBOUND_HTTP =
  /(POST\s+https?:\/\/|fetch\(\s*['"]https?:\/\/|curl\s+(-X\s+POST\s+)?https?:\/\/)/i;

function excerptAround(body: string, start: number, end: number): string {
  const from = Math.max(0, start - 40);
  const to = Math.min(body.length, end + 40);
  let out = body.slice(from, to).replace(/\n/g, " ");
  if (from > 0) out = `…${out}`;
  if (to < body.length) out = `${out}…`;
  return out;
}

/** Run every heuristic over one text. Exported for tests. */
export function scanBody(body: string): PortableScanFinding[] {
  const out: PortableScanFinding[] = [];
  const lower = body.toLowerCase();

  // Exfiltration: known sensitive paths + an action verb suggesting they
  // should be read / uploaded.
  const exfil = EXFIL_SENSITIVE_PATH.exec(lower);
  if (
    exfil &&
    (lower.includes("read") ||
      lower.includes("upload") ||
      lower.includes("post") ||
      lower.includes("send") ||
      lower.includes("exfil"))
  ) {
    out.push({
      category: "exfiltration",
      severity: "high",
      excerpt: excerptAround(body, exfil.index, exfil.index + exfil[0].length),
      why: "References a sensitive credential path together with a read/send verb.",
    });
  }

  for (const needle of PROMPT_INJECTION_NEEDLES) {
    const idx = lower.indexOf(needle);
    if (idx !== -1) {
      out.push({
        category: "prompt_injection",
        severity: "medium",
        excerpt: excerptAround(body, idx, idx + needle.length),
        why: `Contains an instruction-override phrase ("${needle}").`,
      });
      break;
    }
  }

  for (const needle of TOOL_ABUSE_NEEDLES) {
    const idx = lower.indexOf(needle);
    if (idx !== -1) {
      out.push({
        category: "tool_abuse",
        severity: "medium",
        excerpt: excerptAround(body, idx, idx + needle.length),
        why: `Suggests disabling or bypassing safety / review ("${needle}").`,
      });
      break;
    }
  }

  const shell = SUSPICIOUS_SHELL.exec(body);
  if (shell) {
    out.push({
      category: "suspicious_shell",
      severity: "high",
      excerpt: excerptAround(body, shell.index, shell.index + shell[0].length),
      why: "Includes a destructive or privilege-elevation shell command.",
    });
  }

  const http = OUTBOUND_HTTP.exec(body);
  if (http) {
    out.push({
      category: "external_callback",
      severity: "low",
      excerpt: excerptAround(body, http.index, http.index + http[0].length),
      why: "Posts data to an external URL. Verify the destination is what you expect.",
    });
  }

  return out;
}

/** Scan every item in a package's content; clean items are omitted. */
export function scanContent(content: PortableContent): PortableScanResponse {
  const items: PortableScanItem[] = [];

  if (content.claudeMd !== undefined) {
    const findings = scanBody(content.claudeMd);
    if (findings.length)
      items.push({ kind: "claude_md", id: "CLAUDE.md", findings });
  }
  for (const skill of content.skills) {
    const findings = scanBody(skill.body);
    if (findings.length)
      items.push({ kind: "skill", id: skill.slug, findings });
  }
  for (const routine of content.routines) {
    const findings = scanBody(`${routine.name} \n ${routine.prompt}`);
    if (findings.length)
      items.push({ kind: "routine", id: routine.id, findings });
  }
  for (const learning of content.learnings) {
    const findings = scanBody(learning.text);
    if (findings.length)
      items.push({ kind: "learning", id: learning.id, findings });
  }

  return { disclaimer: DISCLAIMER, items };
}
