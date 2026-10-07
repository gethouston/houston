import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ThinkingLevel } from "../types";
import { toSdkEffort } from "./effort";
import type { ClaudeQuery, TurnAuth } from "./session-deps";
import type { WarmLaunch } from "./session-warm";

/**
 * Everything that varies between two spawns of one session's CLI. The rest
 * of its options (cwd, tools, callbacks, system prompt) is the session's
 * fixed `baseOptions`.
 */
export interface AttemptLaunch {
  resume: string | undefined;
  /** The per-prompt env carrying the credential stored NOW (PRODUCT-1355). */
  env: TurnAuth["env"];
  /** The SDK model string. */
  model: string;
  thinkingLevel: ThinkingLevel | undefined;
}

/** The full SDK options one spawn runs with. */
export function attemptOptions(
  baseOptions: Options,
  launch: AttemptLaunch,
  abortController: AbortController,
): Options {
  const effort = launch.thinkingLevel
    ? toSdkEffort(launch.thinkingLevel)
    : undefined;
  return {
    ...baseOptions,
    // The per-turn env OVERRIDES the build-time one in baseOptions, so this
    // spawn carries the currently stored credential (PRODUCT-1355).
    env: launch.env,
    model: launch.model,
    abortController,
    ...(launch.resume ? { resume: launch.resume } : {}),
    ...(effort ? { thinking: effort.thinking, effort: effort.effort } : {}),
  };
}

/** Equal launches spawn identical processes from the same `baseOptions`. */
export function sameLaunch(a: AttemptLaunch, b: AttemptLaunch): boolean {
  return (
    a.resume === b.resume &&
    a.model === b.model &&
    a.thinkingLevel === b.thinkingLevel &&
    sameEnv(a.env, b.env)
  );
}

function sameEnv(a: AttemptLaunch["env"], b: AttemptLaunch["env"]): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
  );
}

/**
 * The stream one attempt reads: the prompt sent to the CLI started ahead of
 * it when there is one and it came up, else a fresh `query()` spawn.
 */
export async function openAttemptStream(
  query: ClaudeQuery,
  text: string,
  options: Options,
  warm: WarmLaunch | undefined,
): Promise<AsyncIterable<SDKMessage>> {
  const claimed = warm ? await warm.claim(text) : undefined;
  return claimed ?? query({ prompt: text, options });
}
