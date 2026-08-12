const CAPTURE_ATTEMPTS = 3;
const CAPTURE_RETRY_DELAY_MS = 250;

/**
 * Retry the connect-once capture call after a failed/ambiguous response.
 *
 * This replays the WHOLE capture, not just its scrub half — from this seam the
 * client cannot tell whether an ambiguous response (network drop mid-request)
 * died before or after the host's central PUT, so a scrub-only retry is not
 * expressible here. That is safe because the host made capture idempotent
 * (PRODUCT-1318, host channel/capture-credential.ts): a replay after the PUT +
 * scrub both landed finds nothing exportable and settles against the central
 * store instead of erroring; a replay after the PUT but before the scrub
 * re-PUTs the same still-current family (within these sub-second retries the
 * gateway has not rotated it) and re-attempts the scrub. A scrub the host
 * could not complete no longer fails the capture at all — the runtime's serve
 * sync self-heals it — so this retry only ever sees genuine capture failures.
 */
export async function retryCredentialCapture(
  capture: () => Promise<void>,
  wait: (ms: number) => Promise<unknown> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      await capture();
      return;
    } catch (err) {
      lastError = err;
      if (attempt < CAPTURE_ATTEMPTS)
        await wait(CAPTURE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}
