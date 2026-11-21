import type { ConnectNotice, ConnectStep } from "./connect-flow-run";
import { connectFlowKeyIsFor } from "./connect-flow-scope.ts";
import type { PollOutcome, Waker } from "./model";

export interface ConnectFlow {
  states: Record<string, ConnectStep>;
  notices: Record<string, ConnectNotice>;
  origins: Record<string, string>;
  connect: (toolkit: string, origin: string) => Promise<ConnectAttempt>;
  reopen: (toolkit: string) => Promise<void>;
  checkNow: (toolkit: string) => void;
  cancel: (toolkit: string) => void;
}

export interface ConnectAttempt {
  outcome: PollOutcome | null;
  initiated: boolean;
}

export interface FlowEntry {
  waker: Waker;
  cancelled: boolean;
  redirectUrl: string | null;
  connectionId: string | null;
  promise: Promise<PollOutcome | null> | null;
}

export type FlowRegistry = Map<string, FlowEntry>;

export function createRegistry(): FlowRegistry {
  return new Map();
}

export function beginFlow(
  reg: FlowRegistry,
  key: string,
  waker: Waker,
): FlowEntry | null {
  if (reg.has(key)) return null;
  const entry: FlowEntry = {
    waker,
    cancelled: false,
    redirectUrl: null,
    connectionId: null,
    promise: null,
  };
  reg.set(key, entry);
  return entry;
}

export function flowPromise(
  reg: FlowRegistry,
  key: string,
): Promise<PollOutcome | null> | null {
  return reg.get(key)?.promise ?? null;
}

export function endFlow(reg: FlowRegistry, key: string): void {
  reg.delete(key);
}

export function cancelFlow(reg: FlowRegistry, key: string): void {
  const entry = reg.get(key);
  if (!entry) return;
  entry.cancelled = true;
  entry.waker.wake();
}

export function cancelFlowsForDisconnect(
  reg: FlowRegistry,
  toolkit: string,
  connectionId?: string,
): void {
  for (const [key, entry] of reg) {
    if (!connectFlowKeyIsFor(key, toolkit)) continue;
    if (connectionId !== undefined && entry.connectionId !== connectionId)
      continue;
    cancelFlow(reg, key);
  }
}

export function wakeFlow(reg: FlowRegistry, key: string): void {
  reg.get(key)?.waker.wake();
}

export function flowRedirectUrl(reg: FlowRegistry, key: string): string | null {
  return reg.get(key)?.redirectUrl ?? null;
}
