export function isClosedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Target (page, context or browser )?(has been )?closed|Session closed|has been closed|Target closed/i.test(
      error.message,
    )
  );
}

export function warnUnlessClosed(what: string): (error: unknown) => void {
  return (error) => {
    if (!isClosedError(error))
      console.warn(`[browser] ${what} failed:`, firstLine(error));
  };
}

export function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split("\n")[0] ?? "").replace(/\s+at\s+\S+:\/\/\S*$/, "");
}
