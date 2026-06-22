interface ChatEntry {
  feed_type: string;
  data: unknown;
}

export interface OptimisticMsg {
  id: string;
  text: string;
  sentAt: number;
}

const pending = new Map<string, OptimisticMsg[]>();
const listeners = new Set<() => void>();
let version = 0;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function snapshot(): number {
  return version;
}

export function pushPending(sessionKey: string, text: string): string {
  const id =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  const arr = pending.get(sessionKey) ?? [];
  arr.push({ id, text, sentAt: Date.now() });
  pending.set(sessionKey, arr);
  notify();
  return id;
}

export function dropPending(sessionKey: string, id: string): void {
  const arr = pending.get(sessionKey);
  if (!arr) return;
  const next = arr.filter((m) => m.id !== id);
  if (next.length === 0) pending.delete(sessionKey);
  else pending.set(sessionKey, next);
  notify();
}

export function pendingForSession(sessionKey: string): OptimisticMsg[] {
  return pending.get(sessionKey) ?? [];
}

export function reconcilePending(
  sessionKey: string,
  serverItems: ChatEntry[],
): void {
  const arr = pending.get(sessionKey);
  if (!arr?.length) return;
  const texts = new Set(
    serverItems
      .filter((e) => e.feed_type === "user_message")
      .map((e) => String(e.data)),
  );
  const now = Date.now();
  const surviving = arr.filter(
    (m) => !texts.has(m.text) && now - m.sentAt < 30_000,
  );
  if (surviving.length === arr.length) return;
  if (surviving.length === 0) pending.delete(sessionKey);
  else pending.set(sessionKey, surviving);
  notify();
}

function notify(): void {
  version++;
  for (const l of listeners) l();
}
