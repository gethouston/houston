export function serialQueue() {
  const tails = new Map<string, Promise<void>>();
  return function queued<T>(key: string, write: () => Promise<T>): Promise<T> {
    const result = (tails.get(key) ?? Promise.resolve()).then(write);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
