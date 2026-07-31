const CAPTURE_ATTEMPTS = 3;
const CAPTURE_RETRY_DELAY_MS = 250;

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
