export type RejectionReporter = (command: string, err: unknown) => void;

export function reportRejection(
  work: Promise<unknown>,
  command: string,
  report: RejectionReporter,
): void {
  void work.catch((err: unknown) => report(command, err));
}
