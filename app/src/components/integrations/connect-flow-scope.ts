const SEP = "\u0000";

const ACCOUNT_SCOPE = `account${SEP}`;

export function connectFlowScope(agentId: string | undefined): string {
  return agentId === undefined ? ACCOUNT_SCOPE : `agent${SEP}${agentId}${SEP}`;
}

export function connectFlowKey(scope: string, toolkit: string): string {
  return `${scope}${toolkit}`;
}

export function connectFlowKeyIsFor(key: string, toolkit: string): boolean {
  return key.endsWith(`${SEP}${toolkit}`);
}

export function scopedBySlug<T>(
  record: Record<string, T>,
  scope: string,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith(scope)) out[key.slice(scope.length)] = value;
  }
  return out;
}
