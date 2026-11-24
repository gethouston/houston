import type { FileSnapshot } from "../session/file-changes";
import { TurnSetupError } from "./turn-layout";

export type FileState = NonNullable<ReturnType<FileSnapshot["get"]>>;

const LISTED_MAX = 5;

function named(rels: readonly string[]): string {
  const shown = rels.slice(0, LISTED_MAX).map((rel) => {
    const segments = rel.split("/");
    return segments[0] === "workspaces" && segments.length > 3
      ? segments.slice(3).join("/")
      : rel;
  });
  const more = rels.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

function overBudget(error: unknown): boolean {
  return error instanceof TurnSetupError && error.code === "hydrate_over_cap";
}

export class DeferredFilesUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeferredFilesUnavailableError";
  }
}

export function deferredUnavailable(
  rels: readonly string[] | undefined,
  error: unknown,
): DeferredFilesUnavailableError {
  if (error instanceof DeferredFilesUnavailableError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  if (!rels)
    return new DeferredFilesUnavailableError(
      overBudget(error)
        ? "The agent's files are larger than one conversation can load, so commands that read or change its folders cannot run in this conversation. Continue without them, and tell the person what you could not do."
        : `The agent's files could not be loaded in this conversation (${detail}), so commands that read or change its folders cannot run. Continue without them, and tell the person what you could not do.`,
      { cause: error },
    );
  return new DeferredFilesUnavailableError(
    overBudget(error)
      ? `These files are not available in this conversation, because the agent's files are larger than one conversation can load: ${named(rels)}. Continue without them, and tell the person which ones you could not open.`
      : `These files could not be loaded in this conversation (${detail}): ${named(rels)}. Continue without them, and tell the person which ones you could not open.`,
    { cause: error },
  );
}

export function partialTreeNotice(
  error: unknown,
): DeferredFilesUnavailableError {
  const why = overBudget(error)
    ? "because they are larger than one conversation can load"
    : `(${error instanceof Error ? error.message : String(error)})`;
  return new DeferredFilesUnavailableError(
    `Some of the agent's files could not be loaded in this conversation ${why}. Commands see only the files that loaded, and changes to the missing ones are not saved. Run the command again to continue with what is here, and tell the person which files you could not use.`,
    { cause: error },
  );
}

function lateMessage(rels: readonly string[] | undefined): string {
  return rels
    ? `These files are still loading: ${named(rels)}. Try them again in a moment, or continue without them.`
    : "The agent's files are still loading, so this command cannot run yet. Tools that open one specific file work now. Try the command again in a moment.";
}

export async function untilSettled<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
  deadlineMs: number,
  rels?: readonly string[],
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => undefined;
  const stop = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(lateMessage(rels))), deadlineMs);
    onAbort = () => reject(new Error("the turn was stopped"));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, stop]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
