import type { FanOutGate } from "./fan-out";
import type {
  WorkspacePreferenceReporter,
  WorkspaceSelectionState,
} from "./modules/preferences/workspace-selection-state";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Clock {
  now(): number;
  monotonic?(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export type LogFields = Record<string, unknown>;

export interface SdkLogger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export interface PageLifecycle {
  isUnloading(): boolean;
  onLive(listener: () => void): () => void;
}

export interface SdkPorts {
  workspaceSelection?: WorkspaceSelectionState;
  reportPreferenceError?: WorkspacePreferenceReporter;
  userId?: () => string | null;
  fetch: typeof fetch;
  rawFetch?: typeof fetch;
  random?: () => number;
  storage: KeyValueStore;
  devicePreferences: KeyValueStore;
  clock: Clock;
  logger: SdkLogger;
  pageLifecycle?: PageLifecycle;
  fanOut?: FanOutGate;
}

export interface SdkConfig {
  baseUrl: string;
  ports: SdkPorts;
  conversationCacheMax?: number;
  reactivity?: boolean;
}
