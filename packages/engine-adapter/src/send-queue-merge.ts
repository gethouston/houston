import type {
  GrantableOperation,
  MessageApproval,
  MessageMention,
  SessionStartRequest,
} from "@houston/wire-types";

export type MergedSendFields = Pick<
  SessionStartRequest,
  "prompt" | "displayText" | "mentions" | "approvals" | "grants"
>;

const joinLines = (parts: readonly string[]): string =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");

function unionMentions(
  reqs: readonly SessionStartRequest[],
): MessageMention[] | undefined {
  const seen = new Map<string, MessageMention>();
  for (const r of reqs)
    for (const m of r.mentions ?? [])
      if (!seen.has(m.userId)) seen.set(m.userId, m);
  return seen.size > 0 ? [...seen.values()] : undefined;
}

function unionApprovals(
  reqs: readonly SessionStartRequest[],
): MessageApproval[] | undefined {
  const seen = new Map<string, MessageApproval>();
  for (const r of reqs)
    for (const a of r.approvals ?? [])
      if (!seen.has(a.requestId)) seen.set(a.requestId, a);
  return seen.size > 0 ? [...seen.values()] : undefined;
}

function unionGrants(
  reqs: readonly SessionStartRequest[],
): GrantableOperation[] | undefined {
  const grants = new Set<GrantableOperation>();
  for (const req of reqs)
    for (const operation of req.grants ?? []) grants.add(operation);
  return grants.size ? [...grants] : undefined;
}

export function mergeSendFields(
  reqs: readonly SessionStartRequest[],
): MergedSendFields {
  return {
    prompt: joinLines(reqs.map((r) => r.prompt)),
    displayText: reqs.some((r) => r.displayText !== undefined)
      ? joinLines(reqs.map((r) => r.displayText ?? r.prompt))
      : undefined,
    mentions: unionMentions(reqs),
    approvals: unionApprovals(reqs),
    grants: unionGrants(reqs),
  };
}
