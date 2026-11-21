import { mkdtemp, rm } from "node:fs/promises";
import { join, posix } from "node:path";
import type { TokenUsage } from "@houston/runtime-client";
import {
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import { recordTokenSpend } from "../ai/usage/ledger";

const LEDGER_FILE = "token-usage.json";

const MAX_ATTEMPTS = 4;
const LEDGER_DEADLINE_MS = 5_000;

export async function recordPooledTokenSpend(input: {
  store: ObjectStore;
  prefix: string;
  dataRel: string;
  provider: string;
  usage: TokenUsage;
  scratchDir: string;
  deadlineMs?: number;
}): Promise<void> {
  const rel = posix.join(input.dataRel, LEDGER_FILE);
  const key = input.prefix ? posix.join(input.prefix, rel) : rel;
  const deadline = AbortSignal.timeout(input.deadlineMs ?? LEDGER_DEADLINE_MS);
  try {
    const work = await mkdtemp(join(input.scratchDir, "ledger-"));
    const fold = foldInto(input, key, work, deadline);
    const cleanup = () => removeScratch(work);
    void fold.then(cleanup, cleanup);
    await Promise.race([
      fold,
      new Promise<never>((_resolve, reject) =>
        deadline.addEventListener("abort", () => reject(deadline.reason), {
          once: true,
        }),
      ),
    ]);
  } catch (error) {
    console.warn(
      `[usage-ledger] pooled turn spend for ${input.provider} not recorded (${key}): ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    );
  }
}

async function foldInto(
  input: { store: ObjectStore; provider: string; usage: TokenUsage },
  key: string,
  work: string,
  signal: AbortSignal,
): Promise<void> {
  const local = join(work, LEDGER_FILE);
  for (let attempt = 1; ; attempt++) {
    const generation = await readLedger(input.store, key, local, signal);
    signal.throwIfAborted();
    recordTokenSpend(input.provider, input.usage, work);
    try {
      await input.store.upload(local, key, {
        signal,
        ...(generation !== null ? { ifGenerationMatch: generation } : {}),
      });
      return;
    } catch (error) {
      if (!(error instanceof StoreConflictError) || attempt >= MAX_ATTEMPTS)
        throw error;
    }
  }
}

async function removeScratch(work: string): Promise<void> {
  try {
    await rm(work, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `[usage-ledger] could not remove ${work}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readLedger(
  store: ObjectStore,
  key: string,
  local: string,
  signal: AbortSignal,
): Promise<string | null> {
  await rm(local, { force: true });
  try {
    if (!store.downloadVersioned) {
      await store.download(key, local, { signal });
      return null;
    }
    return (
      (await store.downloadVersioned(key, local, { signal })).generation ?? null
    );
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
    await rm(local, { force: true });
    return store.downloadVersioned ? "0" : null;
  }
}
