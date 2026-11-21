import type { AgentIR } from "./ir";

export interface SecretFinding {
  pattern: string;
  excerpt: string;
}

const SECRET_PATTERNS: Array<{ pattern: string; re: RegExp }> = [
  { pattern: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { pattern: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { pattern: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { pattern: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { pattern: "Google auth key", re: /\bAQ\.[0-9A-Za-z_-]{25,}\b/g },
  { pattern: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { pattern: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    pattern: "Stripe secret key",
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    pattern: "Private key block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    pattern: "JWT",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  { pattern: "Bearer credential", re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
];

function redact(match: string): string {
  if (match.length <= 8) return "*".repeat(match.length);
  return `${match.slice(0, 4)}…${match.slice(-2)}`;
}

export function scanForSecrets(text: string): SecretFinding[] {
  const seen = new Set<string>();
  const findings: SecretFinding[] = [];
  for (const { pattern, re } of SECRET_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const excerpt = redact(match[0]);
      const key = `${pattern}:${excerpt}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({ pattern, excerpt });
      }
    }
  }
  return findings;
}

export function scanIrForSecrets(ir: AgentIR): SecretFinding[] {
  const haystacks: string[] = [
    ir.instructions,
    ir.identity.name,
    ir.identity.tagline ?? "",
    ir.identity.description,
    ...ir.identity.tags,
    ...ir.skills.map((s) => s.body),
    ...ir.learnings.map((l) => l.text),
  ];
  return scanForSecrets(haystacks.join("\n"));
}
