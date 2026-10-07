import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { markTurnOnce } from "../../turn/turn-network-marks";
import {
  type AttemptLaunch,
  attemptOptions,
  sameLaunch,
} from "./attempt-options";
import type { ClaudeStartup, ClaudeWarmQuery } from "./session-deps";

/** How long releasing a started CLI may take before it is killed instead. */
const RELEASE_DEADLINE_MS = 5_000;

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * A Claude CLI spawned before its prompt, with the exact options that prompt
 * will run with, so its start overlaps the rest of the turn's setup. Used by
 * exactly one prompt (`claim`) or stopped (`release`), never both.
 *
 * Its options are fixed at spawn: a prompt whose launch differs in anything
 * (resume id, credential env, model, effort) must never take it. And a
 * process resumed on a transcript appends to that transcript as it exits, so
 * it is released, and its exit awaited, before anything else opens that
 * session (a compaction, a fresh spawn).
 */
export class WarmLaunch {
  readonly abortController = new AbortController();
  private taken = false;
  private readonly ready: Promise<ClaudeWarmQuery | undefined>;

  constructor(
    startup: ClaudeStartup,
    baseOptions: Options,
    readonly launch: AttemptLaunch,
  ) {
    markTurnOnce("t_claude_spawn");
    const options = attemptOptions(baseOptions, launch, this.abortController);
    this.ready = startup({ options }).then(
      (warm) => {
        markTurnOnce("t_claude_ready");
        return warm;
      },
      (error: unknown) => {
        // A release aborts a start in flight; anything else is a failed
        // start, which the claiming prompt replaces with its own spawn.
        if (!this.abortController.signal.aborted)
          console.warn(
            `[claude] the CLI started ahead of the prompt failed; the prompt starts its own (${errMessage(error)})`,
          );
        return undefined;
      },
    );
  }

  matches(launch: AttemptLaunch): boolean {
    return sameLaunch(this.launch, launch);
  }

  /** Send the prompt; undefined when the process never came up. */
  async claim(text: string): Promise<AsyncIterable<SDKMessage> | undefined> {
    if (this.taken) return undefined;
    this.taken = true;
    const warm = await this.ready;
    return warm?.query(text);
  }

  /** Stop the process if no prompt took it; resolves once it exited. */
  async release(): Promise<void> {
    if (this.taken) return;
    this.taken = true;
    const warm = await withinDeadline(this.ready);
    if (!warm) {
      this.abortController.abort();
      return;
    }
    // No prompt: closing its input ends the CLI the way a finished turn
    // ends it, and the stream completes once the process has exited.
    const exited = await withinDeadline(
      drain(warm.query(noPrompt())).then(
        () => true as const,
        (error: unknown) => {
          console.warn(
            `[claude] the CLI started ahead of the prompt did not exit cleanly (${errMessage(error)})`,
          );
          return true as const;
        },
      ),
    );
    if (!exited) this.abortController.abort();
  }
}

async function drain(stream: AsyncIterable<SDKMessage>): Promise<void> {
  for await (const _message of stream) {
    // Nothing was prompted: whatever the CLI reports while exiting is moot.
  }
}

async function* noPrompt(): AsyncGenerator<never> {}

/** The promise's value, or undefined once the release deadline passes. */
async function withinDeadline<T>(promise: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), RELEASE_DEADLINE_MS);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A session's one started-ahead CLI, from `warm()` to the prompt that takes it. */
export class WarmSlot {
  private pending: WarmLaunch | undefined;

  start(startup: ClaudeStartup, baseOptions: Options, launch: AttemptLaunch) {
    this.pending ??= new WarmLaunch(startup, baseOptions, launch);
  }

  /**
   * The started CLI when it was spawned with exactly `launch`. Any other is
   * stopped first and its exit awaited, so the prompt's own spawn never
   * shares a transcript with it.
   */
  async take(launch: AttemptLaunch): Promise<WarmLaunch | undefined> {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending || pending.matches(launch)) return pending;
    await pending.release();
    return undefined;
  }

  release(): Promise<void> {
    const pending = this.pending;
    this.pending = undefined;
    return pending ? pending.release() : Promise.resolve();
  }
}
