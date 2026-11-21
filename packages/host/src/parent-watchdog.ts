export interface ParentWatchdogOptions {
  stdin?: NodeJS.ReadStream;
  supervised?: boolean;
  onParentExit: () => void | Promise<void>;
  exit?: (code: number) => void;
  log?: (message: string) => void;
}

export function installParentWatchdog(opts: ParentWatchdogOptions): boolean {
  const stdin = opts.stdin ?? process.stdin;
  const supervised = opts.supervised ?? process.env.HOUSTON_SUPERVISED === "1";
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const log = opts.log ?? console.error;

  if (!supervised) return false;

  let fired = false;
  const teardown = async () => {
    if (fired) return;
    fired = true;
    log("[local-host] parent stdin closed (app gone) — shutting down");
    try {
      await opts.onParentExit();
    } catch (err) {
      log(`[local-host] error during parent-exit teardown: ${String(err)}`);
    }
    exit(0);
  };

  stdin.on("end", teardown);
  stdin.on("close", teardown);
  stdin.on("error", teardown);
  stdin.resume();
  return true;
}
