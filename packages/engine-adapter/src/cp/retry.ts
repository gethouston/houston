import { HoustonEngineError } from "../client/errors";

export const READ_RETRY_DELAYS_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isTransientHostError(err: unknown): boolean {
  if (err instanceof HoustonEngineError) return err.status >= 500;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status >= 500;
  return err instanceof TypeError;
}

export async function retryTransientRead<T>(
  read: () => Promise<T>,
  delays: readonly number[] = READ_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= delays.length || !isTransientHostError(err)) throw err;
      await sleep(delays[attempt]);
    }
  }
}
