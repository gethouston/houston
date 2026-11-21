import { queryKeys } from "../query-keys.ts";
import { IdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import {
  deserializeSession,
  type Session,
  serializeSession,
} from "./session.ts";
import { createSessionLoader, type SessionLoadState } from "./session-load.ts";
import { isKeychainMode, storage, storageKey } from "./session-storage-kv.ts";

export type { SessionLoadState } from "./session-load.ts";

export const SESSION_QUERY_KEY = queryKeys.session();

let epoch = 0;

export function sessionEpoch(): number {
  return epoch;
}

type Subscriber = (session: Session | null) => void;
const subscribers = new Set<Subscriber>();

export function subscribeSession(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function notify(session: Session | null): void {
  for (const cb of subscribers) {
    try {
      cb(session);
    } catch (e) {
      identityLog(
        "error",
        `session subscriber threw: ${String(e)}`,
        "identity/session-store",
      );
    }
  }
}

const loadSessionStateImpl = createSessionLoader({
  read: () => storage.getItem(storageKey),
  notify,
  keychainMode: isKeychainMode,
  rewrite: (blob) => storage.setItem(storageKey, blob),
  epoch: sessionEpoch,
  remove: () => storage.removeItem(storageKey),
});

export function loadSessionState(): Promise<SessionLoadState> {
  return loadSessionStateImpl();
}

export async function loadSession(): Promise<Session | null> {
  const state = await loadSessionState();
  return state.kind === "session" ? state.session : null;
}

export async function peekSession(): Promise<Session | null> {
  const read = await storage.getItem(storageKey);
  return read.ok ? deserializeSession(read.value) : null;
}

export async function saveSession(session: Session): Promise<void> {
  await storage.setItem(storageKey, serializeSession(session));
  notify(session);
}

export async function clearSession(): Promise<void> {
  epoch += 1;
  let failure: unknown;
  try {
    await storage.removeItem(storageKey);
  } catch (first) {
    identityLog(
      "warn",
      `session clear failed, retrying once: ${String(first)}`,
      "identity/session-store",
    );
    try {
      await storage.removeItem(storageKey);
    } catch (second) {
      failure = second;
      identityLog(
        "error",
        `session clear FAILED after a retry; the stored session survives: ${String(second)}`,
        "identity/session-store",
      );
    }
  }
  notify(null);
  if (failure !== undefined) {
    throw new IdentityError("session_clear_failed", { cause: failure });
  }
}
