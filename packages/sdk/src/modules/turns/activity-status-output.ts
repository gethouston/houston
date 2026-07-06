import type { SdkLogger } from "../../ports";
import type {
  BoardStatus,
  FeedOutput,
  PendingInteraction,
} from "./feed-output";

/**
 * Persist a board-card status by the chat's session key, with the interaction
 * the turn ended on (`null` clears it — turn start, and every settle that
 * carries no interaction). The activities module backs this
 * ({@link ActivitiesModule.setStatusBySessionKey}); it is injected as a bound
 * function so the turns module depends on ONE activities capability, not the
 * whole module (no import cycle).
 */
export type BoardStatusPersister = (
  agentId: string,
  sessionKey: string,
  status: BoardStatus,
  pendingInteraction: PendingInteraction | null,
) => Promise<void>;

/**
 * A {@link FeedOutput} that ONLY persists the board-card status: it PATCHes the
 * turn's activity through {@link BoardStatusPersister} so a mission leaves
 * "running" when its turn settles. Feed items and session status are the
 * conversation VM's job, so those methods are deliberate no-ops.
 *
 * This is the SDK-path counterpart to the web engine-adapter's bus output
 * (`engine-adapter/feed-output.ts`), which the desktop attaches; the SDK ships
 * it as a DEFAULT output so a native shell (iOS) that never calls `addOutput`
 * still writes the card. The persist runs both fire-and-forget (turn start) and
 * awaited (turn settle); a failure is surfaced to the logger and swallowed here
 * so a dropped board write never rejects the settle or leaks an unhandled
 * rejection.
 */
export class ActivityStatusOutput implements FeedOutput {
  constructor(
    private readonly persist: BoardStatusPersister,
    private readonly logger: SdkLogger,
  ) {}

  pushFeedItem(): void {}

  sessionStatus(): void {}

  async persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
  ): Promise<void> {
    try {
      await this.persist(agentPath, sessionKey, status, pendingInteraction ?? null);
    } catch (err) {
      this.logger.warn("activities: board status persist failed", {
        agentId: agentPath,
        sessionKey,
        status,
        error: String(err),
      });
    }
  }
}
