import { parseJobDescription } from "@houston/sdk/job-description";

export const SETUP_GREETING_TTL_MS = 30 * 60_000;

export interface SetupGreetingEntry {
  agentPath: string;
  sessionKey: string;
  agentName: string;
  role: string | null;
  registeredAt: number;
}

function greetingScopeKey(agentPath: string, sessionKey: string): string {
  return `${agentPath}\n${sessionKey}`;
}

function isFresh(entry: SetupGreetingEntry, now: number): boolean {
  return now - entry.registeredAt < SETUP_GREETING_TTL_MS;
}

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

export function setupGreetingRole(
  instructions: string | undefined,
): string | null {
  if (!instructions) return null;
  const role = parseJobDescription(instructions).fields.role?.trim();
  return role ? role : null;
}
