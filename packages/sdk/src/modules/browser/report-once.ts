export function reportOnce(onReport: (err: unknown) => void) {
  let reported = false;
  return {
    report(err: unknown): void {
      if (reported) return;
      reported = true;
      onReport(err);
    },
    rearm(): void {
      reported = false;
    },
  };
}
