export interface TestArming {
  agentReadHoldMs: number;
  failingAgentReads: Set<string>;
  failingAgentReadSegments: Set<string> | null;
  readOnlyWorkspaces: Set<string>;
  importHold: { released: Promise<void>; release: () => void } | null;
}

const disarmed = (): TestArming => ({
  agentReadHoldMs: 0,
  failingAgentReads: new Set<string>(),
  failingAgentReadSegments: null,
  readOnlyWorkspaces: new Set<string>(),
  importHold: null,
});

export let arming: TestArming = disarmed();

export function resetArming(): void {
  arming.importHold?.release();
  arming = disarmed();
}

export function setImportHold(hold: boolean): void {
  if (!hold) {
    arming.importHold?.release();
    arming.importHold = null;
    return;
  }
  if (arming.importHold) return;
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  arming.importHold = { released, release };
}

export function setAgentReadHoldMs(ms: number): void {
  arming.agentReadHoldMs = Math.max(0, ms);
}

export function setFailingAgentReads(
  agentIds: string[],
  segments?: string[] | null,
): void {
  arming.failingAgentReads = new Set(agentIds);
  arming.failingAgentReadSegments =
    segments && segments.length > 0 ? new Set(segments) : null;
}

export function setReadOnlyWorkspaces(agentIds: string[]): void {
  arming.readOnlyWorkspaces = new Set(agentIds);
}

export function isWorkspaceReadOnly(agentId: string): boolean {
  return arming.readOnlyWorkspaces.has(agentId);
}
