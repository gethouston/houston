import { identityLog } from "./log.ts";
import { deserializeSession, type Session } from "./session.ts";
import type { ReadResult } from "./session-storage-kv.ts";

export type SessionLoadState =
  | { kind: "session"; session: Session }
  | { kind: "none" }
  | { kind: "unavailable"; error: string };

export interface SessionLoadDeps {
  read: () => Promise<ReadResult>;
  notify: (session: Session | null) => void;
  keychainMode: boolean;
  rewrite: (blob: string) => Promise<void>;
  epoch: () => number;
  remove: () => Promise<void>;
}

export function createSessionLoader(
  deps: SessionLoadDeps,
): () => Promise<SessionLoadState> {
  let rebound = false;

  async function rebindAcl(blob: string): Promise<void> {
    if (rebound || !deps.keychainMode) return;
    rebound = true;
    const epochAtWrite = deps.epoch();
    try {
      await deps.rewrite(blob);
      if (deps.epoch() !== epochAtWrite) {
        await deps.remove();
      }
    } catch (e) {
      identityLog(
        "error",
        `keychain ACL rebind write failed (session still valid): ${String(e)}`,
        "identity/session-store",
      );
    }
  }

  return async function load(): Promise<SessionLoadState> {
    const read = await deps.read();
    if (!read.ok) {
      identityLog(
        "error",
        `session storage unavailable (read fault): ${read.error}`,
        "identity/session-store",
      );
      return { kind: "unavailable", error: read.error };
    }
    const session = deserializeSession(read.value);
    deps.notify(session);
    if (session && read.value) void rebindAcl(read.value);
    return session ? { kind: "session", session } : { kind: "none" };
  };
}
