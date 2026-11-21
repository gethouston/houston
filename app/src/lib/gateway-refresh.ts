function isTransientRefreshFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === "network" || code === "auth/network-request-failed";
}

let inflight: Promise<string | null> | null = null;

const REJECTED_BEARER_LIMIT = 8;
const rejectedBearers: string[] = [];

export function noteBearerRejected(bearer: string): void {
  if (!bearer) return;
  const at = rejectedBearers.indexOf(bearer);
  if (at >= 0) rejectedBearers.splice(at, 1);
  rejectedBearers.push(bearer);
  if (rejectedBearers.length > REJECTED_BEARER_LIMIT) rejectedBearers.shift();
}

export function noteBearerAccepted(bearer: string): void {
  const at = rejectedBearers.indexOf(bearer);
  if (at >= 0) rejectedBearers.splice(at, 1);
}

export function wasBearerRejected(bearer: string): boolean {
  return rejectedBearers.includes(bearer);
}

export function resetRejectedBearers(): void {
  rejectedBearers.length = 0;
}

export function refreshGatewayBearer(
  refresh: () => Promise<string | null>,
): Promise<string | null> {
  inflight ??= (async () => refresh())()
    .catch((err: unknown) => {
      if (isTransientRefreshFailure(err))
        throw new TypeError("Load failed (session refresh)", { cause: err });
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const REJECTED_MINT_VERIFY_DELAY_MS = 1_000;

interface Verdict {
  accepted: boolean;
}

const episodes = new Map<string, Promise<Verdict>>();
const REPORTED_LIMIT = 8;
const reported: string[] = [];

export function resetRejectedMints(): void {
  episodes.clear();
  reported.length = 0;
}

export interface RejectedMintContext {
  replay: Response;
  bearer: string;
  send: (bearer: string) => Promise<Response>;
  quiet: () => Response;
  sleep: (ms: number) => Promise<void>;
}

export function settleRejectedMint(
  ctx: RejectedMintContext,
): Promise<Response> {
  const existing = episodes.get(ctx.bearer);
  if (existing) return existing.then((verdict) => answerSibling(ctx, verdict));
  if (reported.includes(ctx.bearer)) return Promise.resolve(ctx.quiet());
  const episode = (async () => {
    await ctx.sleep(REJECTED_MINT_VERIFY_DELAY_MS);
    const probe = await ctx.send(ctx.bearer);
    return { accepted: probe.status !== 401, probe };
  })();
  episodes.set(
    ctx.bearer,
    episode.then(({ accepted }) => ({ accepted })),
  );
  return episode.then(({ accepted, probe }) => {
    episodes.delete(ctx.bearer);
    if (accepted) {
      noteBearerAccepted(ctx.bearer);
      return probe;
    }
    noteBearerRejected(ctx.bearer);
    reported.push(ctx.bearer);
    if (reported.length > REPORTED_LIMIT) reported.shift();
    return ctx.replay;
  });
}

async function answerSibling(
  ctx: RejectedMintContext,
  verdict: Verdict,
): Promise<Response> {
  if (!verdict.accepted) return ctx.quiet();
  const replay = await ctx.send(ctx.bearer);
  return replay.status === 401 ? ctx.quiet() : replay;
}
