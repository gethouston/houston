/**
 * The command model: the write half of the SDK.
 *
 * Reads flow through {@link ScopeStore} snapshots; writes flow through
 * *commands*. A command is a JSON {@link CommandEnvelope} (a stable `type`
 * string + optional `payload`) that resolves to a JSON {@link CommandResult}.
 *
 * Two callers share ONE registry of handlers:
 *  - the typed facade methods on `HoustonSdk` (in-process, ergonomic), and
 *  - `HoustonSdk.dispatch(envelope)` — the *bridge path* a native shell uses to
 *    invoke the exact same handler over a serialization boundary.
 *
 * Because both paths hit the same handler, there is one implementation of each
 * write, never a drifting duplicate.
 */

/**
 * A serialized command request. `id` correlates the request with its
 * {@link CommandResult}; `type` selects the handler; `payload` is
 * handler-specific JSON.
 */
export interface CommandEnvelope {
  /** Caller-chosen correlation id, echoed on the result. */
  id: string;
  /** Registered command type selecting the handler. */
  type: string;
  /** Handler-specific JSON arguments. */
  payload?: unknown;
}

/** The outcome of dispatching a command. JSON-serializable. */
export type CommandResult =
  | { id: string; ok: true; value?: unknown }
  | { id: string; ok: false; error: { message: string; status?: number } };

/**
 * Handles one command type. Receives the envelope's `payload` and returns the
 * result value (or a promise of it). Throwing is a valid failure channel —
 * `CommandRegistry.dispatch` converts a throw into an `ok: false` result.
 */
export type CommandHandler = (payload: unknown) => Promise<unknown> | unknown;

/**
 * Type guard for an untrusted value arriving on the bridge path. Verifies the
 * minimal envelope shape (string `id`, string `type`); `payload` is unchecked
 * because it is handler-specific.
 */
export function isCommandEnvelope(value: unknown): value is CommandEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.type === "string";
}

/**
 * Normalize an unknown thrown value into a `CommandResult` error object,
 * preserving an HTTP-style `status` when the error carries a numeric one (e.g.
 * runtime-client's `EngineError`).
 */
function toCommandError(err: unknown): { message: string; status?: number } {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number"
      ? { message: err.message, status }
      : { message: err.message };
  }
  return { message: String(err) };
}

/**
 * A duplicate-safe map of command type → handler with uniform dispatch
 * semantics. One registry is owned by each `HoustonSdk`; modules register their
 * handlers into it at construction time.
 */
export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  /**
   * Register `handler` for `type`. Throws if `type` is already registered —
   * two modules claiming the same command type is a wiring bug, not a
   * last-writer-wins situation.
   */
  register(type: string, handler: CommandHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`command type already registered: ${type}`);
    }
    this.handlers.set(type, handler);
  }

  /** Whether a handler is registered for `type`. */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Route a *validated* envelope to its handler. An unknown `type` resolves to
   * `ok: false` (never throws); a handler that throws or rejects is caught and
   * converted to `ok: false` with the error message (and `status` when present).
   */
  async dispatch(envelope: CommandEnvelope): Promise<CommandResult> {
    const handler = this.handlers.get(envelope.type);
    if (!handler) {
      return {
        id: envelope.id,
        ok: false,
        error: { message: `unknown command type: ${envelope.type}` },
      };
    }
    try {
      const value = await handler(envelope.payload);
      return { id: envelope.id, ok: true, value };
    } catch (err) {
      return { id: envelope.id, ok: false, error: toCommandError(err) };
    }
  }
}
