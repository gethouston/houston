import { describeBearer, formatBearerDescription } from "./bearer-claims";

export const REJECTED_MINT_VERIFY_DELAY_MS = 1_000;

interface Verdict {
  accepted: boolean;
}

const episodes = new Map<string, Promise<Verdict>>();

const REPORTED_LIMIT = 8;
const reported: string[] = [];

function noteReported(bearer: string): void {
  reported.push(bearer);
  if (reported.length > REPORTED_LIMIT) reported.shift();
}

export function resetRejectedMints(): void {
  episodes.clear();
  reported.length = 0;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RejectedMintContext {
  replay: Response;
  bearer: string;
  previousBearer: string;
  send: (bearer: string) => Promise<Response>;
  quiet: () => Response;
  noteAccepted: (bearer: string) => void;
  noteRejected: (bearer: string) => void;
}

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

async function answerSibling(
  ctx: RejectedMintContext,
  verdict: Verdict,
): Promise<Response> {
  if (!verdict.accepted) return ctx.quiet();
  const replay = await ctx.send(ctx.bearer);
  return replay.status === 401 ? ctx.quiet() : replay;
}
