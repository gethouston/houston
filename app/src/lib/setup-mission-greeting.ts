/**
 * Instant hello for the agent's self-setup mission (HOU-867) — pure core,
 * deps injected (the wired registry + React hook live in
 * `hooks/use-setup-greeting.ts`).
 *
 * The setup mission's real intro is a model turn, and on the hosted profile
 * that turn can only run once the pod finishes cold-starting — tens of
 * seconds of a silent "running" card (the regression HOU-867: HOU-713's
 * instant greeting was replaced by the model-driven intro in the self-setup
 * mission). This restores the instant first impression WITHOUT giving up the
 * real mission: the chat renders a derived, localized hello a short beat
 * after create, and drops it the moment the agent's own first output arrives.
 * The hello is DERIVED at render time, never persisted — reloads mid-warm-up
 * re-derive it from the localStorage mirror, and once the real intro is in
 * the transcript the hello never shows again.
 */

/** The hello reveals this long after the mission is registered. */
export const SETUP_GREETING_REVEAL_MS = 1_500;

/** Entries older than this are stale (warm-up long over) — never render. */
export const SETUP_GREETING_TTL_MS = 30 * 60_000;

export interface SetupGreetingEntry {
  agentPath: string;
  sessionKey: string;
  agentName: string;
  registeredAt: number;
}

export function greetingScopeKey(agentPath: string, sessionKey: string) {
  return `${agentPath}\n${sessionKey}`;
}

/** Parse the persisted mirror, dropping malformed and stale entries. */
export function parsePersistedGreetings(
  raw: string | null,
  now: number,
): SetupGreetingEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e): e is SetupGreetingEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as SetupGreetingEntry).agentPath === "string" &&
      typeof (e as SetupGreetingEntry).sessionKey === "string" &&
      typeof (e as SetupGreetingEntry).agentName === "string" &&
      typeof (e as SetupGreetingEntry).registeredAt === "number" &&
      now - (e as SetupGreetingEntry).registeredAt < SETUP_GREETING_TTL_MS,
  );
}

export interface SetupGreetingDeps {
  now(): number;
  /** Read/write the persisted mirror. Failures are the caller's to surface. */
  read(): string | null;
  write(raw: string | null): void;
}

export class SetupGreetingRegistry {
  private entries = new Map<string, SetupGreetingEntry>();
  private listeners = new Set<() => void>();
  private deps: SetupGreetingDeps;

  constructor(deps: SetupGreetingDeps) {
    this.deps = deps;
    for (const entry of parsePersistedGreetings(deps.read(), deps.now())) {
      this.entries.set(
        greetingScopeKey(entry.agentPath, entry.sessionKey),
        entry,
      );
    }
  }

  /** Track a just-started setup mission; the hello reveals after the beat. */
  register(entry: Omit<SetupGreetingEntry, "registeredAt">): void {
    const full = { ...entry, registeredAt: this.deps.now() };
    this.entries.set(greetingScopeKey(entry.agentPath, entry.sessionKey), full);
    this.persist();
    this.notify();
  }

  /** The live entry for a conversation, or null (unknown or stale). */
  get(agentPath: string, sessionKey: string): SetupGreetingEntry | null {
    const entry = this.entries.get(greetingScopeKey(agentPath, sessionKey));
    if (!entry) return null;
    if (this.deps.now() - entry.registeredAt >= SETUP_GREETING_TTL_MS) {
      this.entries.delete(greetingScopeKey(agentPath, sessionKey));
      this.persist();
      return null;
    }
    return entry;
  }

  /** Ms until the entry's hello reveals; 0 = revealed now. */
  revealDelayRemaining(entry: SetupGreetingEntry): number {
    return Math.max(
      0,
      entry.registeredAt + SETUP_GREETING_REVEAL_MS - this.deps.now(),
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    const list = [...this.entries.values()];
    this.deps.write(list.length === 0 ? null : JSON.stringify(list));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
