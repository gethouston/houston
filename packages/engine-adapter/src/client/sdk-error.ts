import { agentIdOfPath } from "../control-plane";
import { wakingStuckTracker } from "../waking-stuck-tracker";
import { HoustonEngineError } from "./errors";

function statusOf(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function bodyOf(err: Error): unknown {
  const raw = (err as { body?: unknown }).body;
  const text = typeof raw === "string" ? raw : err.message;
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function toHoustonEngineError(err: unknown, path: string): unknown {
  if (err instanceof HoustonEngineError) return err;
  const status = statusOf(err);
  if (status === null) return err;
  const translated = new HoustonEngineError(status, bodyOf(err as Error));
  const agentId = agentIdOfPath(path);
  if (agentId) translated.agentId = agentId;
  return translated;
}

export async function viaSdk<T>(
  path: string,
  call: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await call();
  } catch (err) {
    throw toHoustonEngineError(err, path);
  }
  const agentId = agentIdOfPath(path);
  if (agentId) wakingStuckTracker.noteSuccess(agentId);
  return result;
}
