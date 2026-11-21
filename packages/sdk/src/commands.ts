export interface CommandEnvelope {
  id: string;
  type: string;
  payload?: unknown;
}

export type CommandResult =
  | { id: string; ok: true; value?: unknown }
  | { id: string; ok: false; error: { message: string; status?: number } };

export type CommandHandler = (payload: unknown) => Promise<unknown> | unknown;

export function isCommandEnvelope(value: unknown): value is CommandEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.type === "string";
}

export function envelopeId(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return "";
}

function toCommandError(err: unknown): { message: string; status?: number } {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number"
      ? { message: err.message, status }
      : { message: err.message };
  }
  return { message: String(err) };
}

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  register(type: string, handler: CommandHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`command type already registered: ${type}`);
    }
    this.handlers.set(type, handler);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

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
