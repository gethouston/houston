/** Race local-model work against a timeout while sharing its abort signal. */
export function withLocalModelTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      controller.abort();
      reject(new Error("local-model timeout"));
    }, ms);
    controller.signal.addEventListener("abort", () => clearTimeout(id));
  });
  return Promise.race([work(controller.signal), timeout]);
}
