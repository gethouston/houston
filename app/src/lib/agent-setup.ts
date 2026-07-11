import type { RoutineFormData } from "@houston-ai/routines";
import { logger } from "./logger";
import { tauriConfig, tauriRoutines } from "./tauri";

/**
 * The pod-bound tail of agent creation, run after the dialog has already
 * revealed the agent (HOU-649): persist the picked provider/model and, if the
 * user accepted one, its starter routine. Both dispatch to the agent's engine,
 * so on the hosted profile they wait out the pod's cold start — off the create
 * click. Each step surfaces its own error toast via the tauri wrappers; we only
 * add a breadcrumb so a background failure is traceable.
 *
 * Shared by the create-agent dialog and the import wizard (HOU-710) — both
 * must reveal first and finish setup in the background.
 */
export async function finishAgentSetup(
  agentPath: string,
  opts: { provider: string; model: string; routine: RoutineFormData | null },
): Promise<void> {
  try {
    // Always write provider/model to the agent's own config. With workspace
    // defaults retired, the agent is the single source of truth — leaving the
    // field blank would make the engine resolver fall back to its platform
    // default rather than the user's pick.
    const cfg = await tauriConfig.read(agentPath);
    await tauriConfig.write(
      agentPath,
      {
        ...cfg,
        provider: opts.provider as "anthropic" | "openai",
        model: opts.model,
      },
      // Post-create setup rides as a held request that lands when the engine
      // wakes (HOU-649) — never blocked by the warming-write dialog.
      { allowWhileWarming: true },
    );
  } catch (e) {
    logger.error(`[new-agent] provider/model write failed: ${e}`);
  }

  if (opts.routine) {
    // The agent is brand new, so its scheduler was never started (create()
    // doesn't go through setCurrent, and use-houston-init only starts
    // schedulers that existed at launch). startScheduler is idempotent and
    // picks up the just-written routine; plain syncScheduler would be a no-op
    // for an unstarted agent.
    try {
      await tauriRoutines.create(
        agentPath,
        {
          name: opts.routine.name,
          prompt: opts.routine.prompt,
          schedule: opts.routine.schedule,
          enabled: true,
          suppress_when_silent: opts.routine.suppress_when_silent,
          chat_mode: opts.routine.chat_mode,
        },
        // Same held-request posture as the config write above.
        { allowWhileWarming: true },
      );
      await tauriRoutines.startScheduler(agentPath);
    } catch (e) {
      // The tauri wrapper surfaced its own error toast; leave a breadcrumb.
      logger.error(`[new-agent] routine setup failed: ${e}`);
    }
  }
}
