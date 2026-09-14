import { describeBearer, formatBearerDescription } from "./bearer-claims";

/**
 * What to do when the gateway refuses a bearer the refresher JUST handed back
 * (the replay half of `./bearer-recovery.ts`, PRODUCT-1812).
 *
 * Field shape after a laptop wake: N reads share one single-flight refresh,
 * resume in the same microtask flush, all replay the new bearer, and the
 * gateway answers 401 to every replay — while the very same session is
 * accepted again within about a second. Handing each caller the raw 401 filed
 * one report per query for a state that heals itself, and the sibling memory
 * in `bearer-recovery.ts` could not help: no replay had been answered when the
 * siblings decided to send theirs.
 *
 * So a refused mint is not believed on the first answer. ONE caller per bearer
 * owns a verification episode: wait briefly, re-send its own request with the
 * same bearer. Accepted → the episode heals invisibly and the siblings replay
 * their own requests. Refused again → that is a real fault worth surfacing,
 * exactly once: the owner keeps the raw 401 (the Sentry report), every sibling
 * takes the quiet answer the caller supplies.
 */

/** How long a refused mint gets before its one verification re-send. */
export const REJECTED_MINT_VERIFY_DELAY_MS = 1_000;

interface Verdict {
  accepted: boolean;
}

/** In-flight verification per bearer; siblings await the owner's verdict. */
const episodes = new Map<string, Promise<Verdict>>();

/** Bearers whose refusal has already produced the one loud answer. Bounded
 *  like the rejected-bearer memory: a session mints a handful per hour. */
const REPORTED_LIMIT = 8;
const reported: string[] = [];

function noteReported(bearer: string): void {
  reported.push(bearer);
  if (reported.length > REPORTED_LIMIT) reported.shift();
}

/** Test seam. */
export function resetRejectedMints(): void {
  episodes.clear();
  reported.length = 0;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RejectedMintContext {
  /** The refused replay (a 401) — the loud answer, handed out once. */
  replay: Response;
  /** The bearer the gateway refused. */
  bearer: string;
  /** The bearer the ORIGINAL request sent, for the breadcrumb's kid compare. */
  previousBearer: string;
  /** Re-send the caller's own request with a bearer. */
  send: (bearer: string) => Promise<Response>;
  /** The caller's quiet answer for a known-bad bearer. */
  quiet: () => Response;
  /** Record the gateway's verdict in the rejected-bearer memory. */
  noteAccepted: (bearer: string) => void;
  noteRejected: (bearer: string) => void;
}

/**
 * Settle a refused replay of a freshly minted bearer. Resolves the response
 * the caller should return: a healed answer, the one loud 401, or the quiet
 * known-state answer.
 */
export function settleRejectedMint(
  ctx: RejectedMintContext,
): Promise<Response> {
  const existing = episodes.get(ctx.bearer);
  if (existing) return existing.then((verdict) => answerSibling(ctx, verdict));
  if (reported.includes(ctx.bearer)) return Promise.resolve(ctx.quiet());
  const episode = verify(ctx);
  episodes.set(
    ctx.bearer,
    episode.then(({ accepted }) => ({ accepted })),
  );
  return episode.then(({ accepted, probe }) => {
    episodes.delete(ctx.bearer);
    if (accepted) {
      ctx.noteAccepted(ctx.bearer);
      return probe;
    }
    ctx.noteRejected(ctx.bearer);
    noteReported(ctx.bearer);
    // Sentry scrubs any breadcrumb containing "auth", so this prefix must not.
    console.warn(
      "[gateway-bearer] the gateway refused a freshly minted bearer twice; " +
        `refused ${formatBearerDescription(describeBearer(ctx.bearer))}, ` +
        `previous ${formatBearerDescription(describeBearer(ctx.previousBearer))}`,
    );
    return ctx.replay;
  });
}

async function verify(
  ctx: RejectedMintContext,
): Promise<Verdict & { probe: Response }> {
  await sleep(REJECTED_MINT_VERIFY_DELAY_MS);
  const probe = await ctx.send(ctx.bearer);
  return { accepted: probe.status !== 401, probe };
}

/** A sibling replays its own request once the owner proved the bearer; a
 *  refusal it cannot explain (the gateway changed its mind between the two
 *  sends) takes the quiet path rather than a fresh loud report. */
async function answerSibling(
  ctx: RejectedMintContext,
  verdict: Verdict,
): Promise<Response> {
  if (!verdict.accepted) return ctx.quiet();
  const replay = await ctx.send(ctx.bearer);
  return replay.status === 401 ? ctx.quiet() : replay;
}
