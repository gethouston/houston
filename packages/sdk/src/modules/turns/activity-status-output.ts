import type { ActivityStamp } from "@houston/protocol";
import type { SdkLogger } from "../../ports";
import type {
  BoardPersistOptions,
  BoardStatus,
  FeedOutput,
  PendingInteraction,
} from "./feed-output";

export type BoardStatusPersister = (
  agentId: string,
  sessionKey: string,
  status: BoardStatus,
  pendingInteraction: PendingInteraction | null,
  stamp?: ActivityStamp,
) => Promise<void>;

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
    opts?: BoardPersistOptions,
  ): Promise<void> {
    try {
      await this.persist(
        agentPath,
        sessionKey,
        status,
        pendingInteraction ?? null,
        opts?.stamp,
      );
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
