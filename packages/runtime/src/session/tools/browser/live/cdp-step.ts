export const CDP_STEP_MS = 5_000;

export class StepTimeoutError extends Error {
  override name = "TimeoutError";
}

export function within<T>(
  work: Promise<T>,
  what: string,
  ms = CDP_STEP_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new StepTimeoutError(`live view ${what} took over ${ms} ms`)),
      ms,
    );
    timer.unref();
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
