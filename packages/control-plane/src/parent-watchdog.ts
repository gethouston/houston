/**
 * Unix orphan-prevention for the host sidecar.
 *
 * The Tauri shell spawns the compiled host as a child with a PIPED stdin it
 * never writes to (see `app/src-tauri/src/engine_supervisor.rs`). The host runs
 * in its OWN process group (`setpgid`), so the parent's death does NOT auto-kill
 * it. The graceful path (app quit) delivers SIGTERM via the supervisor's Drop —
 * but a FORCE-QUIT / crash / OOM-kill of the app sends NO signal at all. On those
 * paths the only thing the OS guarantees is that the write-end of our stdin pipe
 * closes, which the kernel surfaces to us as EOF. This watchdog listens for that
 * EOF and tears the host down (killing every child runtime first), so the app
 * dying never leaves an orphaned host + runtimes holding ports.
 *
 * The Rust engine has the equivalent `spawn_parent_watchdog`; this is its host
 * counterpart. Windows does NOT get EOF on `TerminateProcess`, so there the
 * supervisor binds the host to a kill-on-close Job Object instead — this
 * watchdog is a no-op when stdin is a TTY (a plain `bun run`, self-host, tests).
 */
export interface ParentWatchdogOptions {
  /** Stdin-like stream to watch. Default `process.stdin`. Injectable for tests. */
  stdin?: NodeJS.ReadStream;
  /** Whether stdin is a TTY (interactive) — then we do NOT watch. */
  isTty?: boolean;
  /** Run on parent-death (EOF). Should kill child runtimes, then resolve. */
  onParentExit: () => void | Promise<void>;
  /** Process exit. Injectable for tests; defaults to process.exit. */
  exit?: (code: number) => void;
  log?: (message: string) => void;
}

/**
 * Watch stdin for EOF and tear the host down when the supervising parent dies.
 * No-op (returns without arming) when stdin is a TTY — there is no supervisor to
 * watch and reading would steal interactive input. Returns whether it armed, so
 * the caller / tests can assert.
 */
export function installParentWatchdog(opts: ParentWatchdogOptions): boolean {
  const stdin = opts.stdin ?? process.stdin;
  const isTty = opts.isTty ?? stdin.isTTY === true;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const log = opts.log ?? console.error;

  // Interactive shell (or no real stdin) → no supervisor pipe to watch.
  if (isTty) return false;

  let fired = false;
  const teardown = async () => {
    if (fired) return; // a concurrent SIGTERM may race us; tear down once
    fired = true;
    log("[local-host] parent stdin closed (app gone) — shutting down");
    try {
      await opts.onParentExit();
    } catch (err) {
      // Sanctioned shutdown-path exception: no UI thread to toast on, and we
      // must still exit. Log loudly so a failed runtime-kill is visible in the
      // app log / bug-report tail rather than silently orphaning a process.
      log(`[local-host] error during parent-exit teardown: ${String(err)}`);
    }
    exit(0);
  };

  // EOF on the parent's pipe arrives as 'end'; a hard parent crash can surface
  // as 'close' or an 'error' on the read end — treat all three as "parent gone".
  stdin.on("end", teardown);
  stdin.on("close", teardown);
  stdin.on("error", teardown);
  // Put the stream into flowing mode so 'end' actually fires; we discard data
  // (the supervisor never writes any).
  stdin.resume();
  return true;
}
