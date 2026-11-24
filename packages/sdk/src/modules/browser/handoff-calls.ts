/**
 * The tool calls of a chat feed, each paired with the result that answers it.
 *
 * A result carrying the turn's tool identity (`turnId` + `toolIndex`, stamped
 * by both the live sink and the history fold) answers exactly that call. One
 * without it falls back to the chat's rule (`attachToolResult` in ui/chat):
 * the first open call of that name in the current turn, else the most recent
 * open one before it. Either way a call a stop, a provider error or a restart
 * left unanswered never shifts the pairing of the calls after it.
 */
export interface BrowserHandoffFeedItem {
  id?: string;
  feed_type: string;
  data: unknown;
  /** The turn this row belongs to, when known. */
  turnId?: string;
  /** The row's position among its turn's tool calls (or results). */
  toolIndex?: number;
}

export type Fields = Record<string, unknown>;

export function fields(value: unknown): Fields | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

export interface FeedCall {
  index: number;
  name: string;
  input: Fields | null;
  turnId?: string;
  toolIndex?: number;
  result: number | null;
}

export interface FeedCalls {
  calls: FeedCall[];
  turnEnds: number[];
}

function sameTurn(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || b === undefined || a === b;
}

function answered(
  calls: readonly FeedCall[],
  item: BrowserHandoffFeedItem,
  turnStart: number,
): FeedCall | undefined {
  const name = fields(item.data)?.name;
  const open = (c: FeedCall) =>
    c.result === null && (typeof name !== "string" || c.name === name);
  if (item.toolIndex !== undefined) {
    for (let k = calls.length - 1; k >= 0; k--) {
      const c = calls[k];
      if (c.toolIndex === item.toolIndex && sameTurn(c.turnId, item.turnId))
        return open(c) ? c : undefined;
    }
  }
  const inTurn = calls.find((c) => c.index > turnStart && open(c));
  if (inTurn) return inTurn;
  for (let k = calls.length - 1; k >= 0; k--)
    if (calls[k].index <= turnStart && open(calls[k])) return calls[k];
  return undefined;
}

export function feedCalls(items: readonly BrowserHandoffFeedItem[]): FeedCalls {
  const calls: FeedCall[] = [];
  const turnEnds: number[] = [];
  let turnStart = -1;
  items.forEach((item, index) => {
    const data = fields(item.data);
    if (item.feed_type === "final_result") turnEnds.push(index);
    if (item.feed_type === "user_message") turnStart = index;
    if (item.feed_type === "tool_call") {
      if (!data || data.input == null) return;
      calls.push({
        index,
        name: String(data.name ?? ""),
        input: fields(data.input),
        ...(item.turnId !== undefined ? { turnId: item.turnId } : {}),
        ...(item.toolIndex !== undefined ? { toolIndex: item.toolIndex } : {}),
        result: null,
      });
    }
    if (item.feed_type === "tool_result") {
      const call = answered(calls, item, turnStart);
      if (call) call.result = index;
    }
  });
  return { calls, turnEnds };
}
