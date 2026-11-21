import type { ResolvedMode } from "@houston/sdk/appearance";

export type NativeTheme = ResolvedMode | null;

export function serializeNativeTheme(
  setTheme: (theme: NativeTheme) => Promise<void>,
): (theme: NativeTheme) => Promise<void> {
  let latest: symbol = Symbol("none");
  let queue: Promise<void> = Promise.resolve();
  return (theme) => {
    const intent = Symbol(theme ?? "system");
    latest = intent;
    const call = queue.then(() =>
      latest === intent ? setTheme(theme) : undefined,
    );
    queue = call.then(
      () => undefined,
      () => undefined,
    );
    return call;
  };
}
