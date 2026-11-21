import type { AgentIR } from "@houston/agentstore-contract";

export const SKILL_DESCRIPTION_MAX = 1024;

export function singleLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const hardSlice = s.slice(0, max - 1);
  const lastSpace = hardSlice.lastIndexOf(" ");
  const body = (
    lastSpace > 0 ? hardSlice.slice(0, lastSpace) : hardSlice
  ).replace(/[\s.,;:!?-]+$/, "");
  return `${body}…`;
}

export function taglineOrDescription(ir: AgentIR, max: number): string {
  const tagline = ir.identity.tagline?.trim();
  if (tagline) return singleLine(tagline);
  return truncateAtWord(singleLine(ir.identity.description), max);
}

export function yamlString(value: string): string {
  const needsQuote =
    value.length === 0 ||
    /^[\s\-?:,[\]{}#&*!|>@`"'%]/.test(value) ||
    /\s$/.test(value) ||
    /: |:$| #|[\n"']/.test(value);
  if (needsQuote) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function renderCredit(ir: AgentIR): string {
  const { creator } = ir.identity;
  return creator.url
    ? `Made by ${creator.displayName} (${creator.url})`
    : `Made by ${creator.displayName}`;
}
