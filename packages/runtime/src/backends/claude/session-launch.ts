import {
  type CompactionCheckpoints,
  conversationCompactions,
} from "../../store/conversation-compaction";
import type { ThinkingLevel } from "../types";
import type { AttemptLaunch } from "./attempt-options";
import type { ClaudeSessionDeps } from "./session-deps";
import { SessionEventSubscriptions } from "./session-events";
import { WarmSlot } from "./session-warm";

/**
 * What a Claude session's next CLI spawn runs with (model, effort, the
 * resume id or the armed summary that replaces it), and the spawn `warm()`
 * starts ahead of a prompt. `ClaudeSession` runs the prompts on top.
 */
export abstract class ClaudeSessionLaunch extends SessionEventSubscriptions {
  protected disposed = false;
  protected model: string;
  protected thinkingLevel: ThinkingLevel | undefined;
  protected readonly compactions: CompactionCheckpoints;
  protected readonly warmSlot = new WarmSlot();

  constructor(protected readonly deps: ClaudeSessionDeps) {
    super();
    this.compactions = deps.compactions ?? conversationCompactions;
    this.model = deps.model;
    this.thinkingLevel = deps.thinkingLevel;
  }

  /**
   * Spawn the CLI the next prompt will run on, now, with that prompt's exact
   * launch (`./session-warm.ts`). The prompt takes it only if its own launch
   * still matches; otherwise it is stopped and the prompt spawns as always.
   */
  warm(): void {
    const { startup } = this.deps;
    if (this.disposed || !startup) return;
    let env: AttemptLaunch["env"];
    try {
      env = this.deps.refreshAuth().env;
    } catch {
      // No spawn without a credential: prompt() reads it again and raises
      // this same refusal on the turn.
      return;
    }
    const { launch } = this.nextLaunch(env);
    this.warmSlot.start(startup, this.deps.baseOptions, launch);
  }

  /** Stop a CLI `warm()` started that no prompt took. Never rejects. */
  releaseWarm(): Promise<void> {
    return this.warmSlot.release();
  }

  /** What the next spawn resumes, and the summary it must carry instead. */
  protected nextLaunch(env: AttemptLaunch["env"]) {
    const checkpoint = this.compactions.read(this.deps.conversationId);
    const resume = checkpoint
      ? undefined
      : this.deps.sessionsStore.resolveResume(this.deps.conversationId);
    const launch: AttemptLaunch = {
      resume,
      env,
      model: this.model,
      thinkingLevel: this.thinkingLevel,
    };
    return { checkpoint, launch };
  }
}
