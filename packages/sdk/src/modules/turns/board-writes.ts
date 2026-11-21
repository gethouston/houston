import type { ActivityStamp } from "@houston/protocol";
import type {
  BoardPersistOptions,
  BoardStatus,
  FeedOutput,
  PendingInteraction,
  TerminalBoardStatus,
} from "./feed-output";

export const BOARD_WRITE_WAIT_MS = 15_000;

interface CardQueue {
  tail: Promise<void>;
  queued: number;
}

const queues = new Map<string, CardQueue>();

export interface TurnCardWrites {
  replyPhase(complete: boolean): void;
  settle(
    status: TerminalBoardStatus,
    pendingInteraction: PendingInteraction | null,
    stamp: ActivityStamp | undefined,
  ): void;
}

function waitAtMost(p: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([p, cap]).finally(() => clearTimeout(timer));
}

export class TurnBoardWrites implements TurnCardWrites {
  private settleWrite: Promise<void> | undefined;

  constructor(
    private readonly output: FeedOutput,
    private readonly agentPath: string,
    private readonly sessionKey: string,
    private readonly waitMs: number = BOARD_WRITE_WAIT_MS,
    private readonly mode: "turn" | "observer" = "turn",
  ) {}

  persist(
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ): Promise<void> {
    const key = `${this.agentPath}\u0000${this.sessionKey}`;
    const q = queues.get(key) ?? { tail: Promise.resolve(), queued: 0 };
    queues.set(key, q);
    const ticket = ++q.queued;
    const write = waitAtMost(q.tail, this.waitMs).then(() => {
      if (opts?.provisional && q.queued !== ticket) return;
      return this.output.persistBoardStatus(
        this.agentPath,
        this.sessionKey,
        status,
        pendingInteraction,
        this.mode === "observer" && opts ? { ...opts, stamp: undefined } : opts,
      );
    });
    q.tail = write.then(
      () => this.drained(key, q, ticket),
      () => this.drained(key, q, ticket),
    );
    return write;
  }

  private drained(key: string, q: CardQueue, ticket: number): void {
    if (q.queued === ticket && queues.get(key) === q) queues.delete(key);
  }

  replyPhase(complete: boolean): void {
    void this.persist(complete ? "needs_you" : "running", null, {
      provisional: true,
      stamp: complete ? "last_message" : undefined,
    });
  }

  settle(
    status: TerminalBoardStatus,
    pendingInteraction: PendingInteraction | null,
    stamp: ActivityStamp | undefined,
  ): void {
    this.settleWrite ??= this.persist(status, pendingInteraction, {
      stamp,
    });
  }

  get settled(): Promise<void> | undefined {
    return this.settleWrite;
  }
}
