import type { ActivityStamp } from "@houston/protocol";
import type {
  BoardPersistOptions,
  BoardStatus,
  FeedOutput,
  PendingInteraction,
  TerminalBoardStatus,
} from "./feed-output";

/**
 * How long a card write waits for the one queued before it. A write settles
 * within its own retries (seconds); the cap only keeps one that never answers
 * from freezing every later write to the same card.
 */
export const BOARD_WRITE_WAIT_MS = 15_000;

/** One conversation's card writes, across turns, observers and outputs. */
interface CardQueue {
  tail: Promise<void>;
  /** Writes ever queued: a write's ticket is the count when it queued. */
  queued: number;
}

const queues = new Map<string, CardQueue>();

/** What a turn's sink drives on its card (see `TurnState.board`). */
export interface TurnCardWrites {
  /** The reply completed (`true`) or the turn carried on after it. */
  replyPhase(complete: boolean): void;
  /** The turn settled: queue its terminal write. */
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

/**
 * One turn's board-card writes. A turn writes its card up to four times —
 * `running` at start, an early `needs_you` when the reply completes
 * (`reply_complete`), `running` again if the turn carried on, then the settle
 * — and each is a request of its own (the cloud's is a list read plus a
 * PATCH). Fired as they come, a slow start write could land AFTER the early
 * `needs_you` and leave a finished card reading "running".
 *
 * So every write to a card waits for the one queued before it, whichever turn
 * queued it: a send queued during the wrap-up starts the next turn the moment
 * this one settles, and that turn's `running` must land after this turn's
 * settle, never race it. The settle is queued AT the settle ({@link settle}),
 * before anything the settle triggers can queue.
 *
 * An early write is only a forecast: once any later write to the card is
 * queued (the turn carried on, settled, or the next turn began) it is skipped,
 * so it can neither flicker the card nor land on the next turn.
 */
export class TurnBoardWrites implements TurnCardWrites {
  private settleWrite: Promise<void> | undefined;

  constructor(
    private readonly output: FeedOutput,
    private readonly agentPath: string,
    private readonly sessionKey: string,
    private readonly waitMs: number = BOARD_WRITE_WAIT_MS,
    private readonly mode: "turn" | "observer" = "turn",
  ) {}

  /**
   * Queue one write behind every earlier write to this card. The returned
   * promise is the write's own: its failure is the caller's. The board
   * outputs report their failures themselves (`ActivityStatusOutput`, the
   * adapter's bus output), so the queue only needs to move on.
   */
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

  /** Fire-and-forget like the start write; see the class doc for the skip. */
  replyPhase(complete: boolean): void {
    void this.persist(complete ? "needs_you" : "running", null, {
      provisional: true,
      stamp: complete ? "last_message" : undefined,
    });
  }

  /** Queue the terminal write once; {@link settled} awaits it. */
  settle(
    status: TerminalBoardStatus,
    pendingInteraction: PendingInteraction | null,
    stamp: ActivityStamp | undefined,
  ): void {
    this.settleWrite ??= this.persist(status, pendingInteraction, {
      stamp,
    });
  }

  /** The terminal write, or undefined when the turn never settled. */
  get settled(): Promise<void> | undefined {
    return this.settleWrite;
  }
}
