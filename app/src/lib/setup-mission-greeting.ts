/**
 * The self-setup mission's permanent hello: the record the app writes the
 * moment it starts that mission, and the role the sentence names.
 *
 * `lib/agent-first-day.ts` opens the mission the host started; `lib/setup-hello.ts`
 * decides which source the hello's two facts come from, and the chat panel
 * renders it as that mission's first item.
 *
 * The app already holds the agent's name and the job it was hired for when it
 * creates them, so it records both here instead of reading them back: on the
 * hosted profile the agent's pod is still cold-starting at that point, its
 * activity list has not been served yet and every file read answers empty — so
 * a hello derived from the agent alone would either not render at all or render
 * without the role and be rewritten with it seconds later.
 *
 * The record is deliberately short-lived. Past {@link SETUP_GREETING_TTL_MS},
 * and on any other device, the hello comes from the agent's own job description
 * ({@link setupGreetingRole}) — which the create wrote from the same answers,
 * so the sentence the user reads is the same one either way.
 *
 * Deps are injected here; the app's single wired registry and the React hook
 * over it live in `hooks/use-setup-greeting.ts`.
 */

import { parseJobDescription } from "@houston/sdk/job-description";

/** Past this the conversation is no longer the one the app just created, and
 *  the agent's own job description is the source. */
export const SETUP_GREETING_TTL_MS = 30 * 60_000;

export interface SetupGreetingEntry {
  agentPath: string;
  sessionKey: string;
  agentName: string;
  /** The job the agent was hired for, or null when its brief names none. */
  role: string | null;
  registeredAt: number;
}

function greetingScopeKey(agentPath: string, sessionKey: string): string {
  return `${agentPath}\n${sessionKey}`;
}

function isFresh(entry: SetupGreetingEntry, now: number): boolean {
  return now - entry.registeredAt < SETUP_GREETING_TTL_MS;
}

/**
 * Parse the persisted mirror, dropping malformed and stale entries. An entry
 * carrying no `role` key is malformed too: `null` says "this agent has no
 * role", and a missing key would pass that off as the same answer.
 */
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
  return parsed.filter((e): e is SetupGreetingEntry => {
    if (typeof e !== "object" || e === null) return false;
    const entry = e as Partial<SetupGreetingEntry>;
    if (typeof entry.agentPath !== "string") return false;
    if (typeof entry.sessionKey !== "string") return false;
    if (typeof entry.agentName !== "string") return false;
    if (typeof entry.registeredAt !== "number") return false;
    if (!("role" in entry)) return false;
    if (entry.role !== null && typeof entry.role !== "string") return false;
    return isFresh(entry as SetupGreetingEntry, now);
  });
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

  /**
   * Record a just-started setup mission. Stale entries are dropped in the same
   * move: pruning belongs to a write, because {@link get} is read from a React
   * render and must not touch storage there.
   */
  register(entry: Omit<SetupGreetingEntry, "registeredAt">): void {
    const now = this.deps.now();
    for (const [key, existing] of this.entries) {
      if (!isFresh(existing, now)) this.entries.delete(key);
    }
    this.entries.set(greetingScopeKey(entry.agentPath, entry.sessionKey), {
      ...entry,
      registeredAt: now,
    });
    this.persist();
    this.notify();
  }

  /**
   * The record for a conversation, or null when there is none or it is stale.
   * Answers the STORED object, so a `useSyncExternalStore` snapshot taken from
   * it is referentially stable between renders.
   */
  get(agentPath: string, sessionKey: string): SetupGreetingEntry | null {
    const entry = this.entries.get(greetingScopeKey(agentPath, sessionKey));
    if (!entry) return null;
    return isFresh(entry, this.deps.now()) ? entry : null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private persist(): void {
    const list = [...this.entries.values()];
    this.deps.write(list.length === 0 ? null : JSON.stringify(list));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * The job the agent was hired for as its job description names it, or null when
 * the description names none. An unread description answers null too, and
 * `setup-hello.ts` holds the hello back until that read lands, so the sentence
 * is never shown in its no-role shape and then rewritten.
 */
export function setupGreetingRole(
  instructions: string | undefined,
): string | null {
  if (!instructions) return null;
  const role = parseJobDescription(instructions).fields.role?.trim();
  return role ? role : null;
}
