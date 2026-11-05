import type { TurnMode } from "@houston/protocol";
import type { ProvidedContext } from "../session/workspace-context";
import type { ResolvedModel, ThinkingLevel } from "./types";

/** What a backend needs to open a session for one conversation. */
export interface CreateSessionOptions {
  conversationId: string;
  nextStepSuggestions?: boolean;
  model: ResolvedModel;
  thinkingLevel?: ThinkingLevel;
  /**
   * The turn's execution mode. "plan" opens the session with the read-only tool
   * subset + the planning prompt overlay; absent or "execute" is the full
   * read/write/act session. A mode change on a live conversation rebuilds the
   * session (see `switchModeIfNeeded`), so this is fixed for the session's life.
   */
  mode?: TurnMode;
  /**
   * Gateway-provided workspace + user context for the prompt (HOU-711, cloud).
   * Present when the hosting gateway sourced it from Supabase and put it on the
   * turn body; absent on local/self-host, where the runtime reads the two
   * WORKSPACE.md / USER.md files instead.
   */
  context?: ProvidedContext;
  /**
   * Start a brand-new backend-native session, ignoring any prior session this
   * backend persisted for the conversation. Set on a cross-BACKEND rebuild
   * (HOU-951): the conversation's history is carried over as a transcript
   * replay on the first prompt, so resuming the backend's own stale
   * pre-switch session would duplicate the pre-switch era and drop everything
   * said on the other backend in between.
   */
  fresh?: boolean;
  /**
   * Canonical history to prepend only if a backend-native resume is rejected
   * and the backend retries the current prompt as a fresh session. Called
   * only then: building it can read archived transcript segments, which a
   * resume that succeeds must never pay for.
   */
  freshRetryPromptPrefix?: () => string;
  /**
   * The context fill the conversation's last reply recorded, for a backend
   * that only measures its own once a turn has run (Claude).
   */
  recordedContextTokens?: () => number | undefined;
}
