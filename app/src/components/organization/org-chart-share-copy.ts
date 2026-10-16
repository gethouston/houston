/**
 * A clipboard the browser refused: a write it did not allow (no focus, no
 * permission). The person's setup, not a bug: nothing to report.
 */
export function isExpectedClipboardRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

/**
 * The dialog's Copy image over a clipboard `write`, DOM-free so it is
 * testable: `true` once the PNG is on the clipboard. A refused write reports
 * unless the drawing failed (it reported itself) or the browser refused it
 * (the person's setup, not a bug). A write that throws before it starts (a
 * `ClipboardItem` the browser will not build) comes back as a rejection, so
 * the caller's `.catch` sees it rather than the click handler.
 */
export function copyImageWith(
  write: (png: Promise<File>) => Promise<void>,
  report: (command: string, error: unknown) => void,
  png: Promise<File>,
): Promise<boolean> {
  let writing: Promise<void>;
  try {
    writing = write(png);
  } catch (error) {
    return Promise.reject(error);
  }
  return writing.then(
    () => true,
    async (error: unknown) => {
      const drawn = await png.then(
        () => true,
        () => false,
      );
      if (drawn && !isExpectedClipboardRefusal(error))
        report("org_chart_share_copy_image", error);
      return false;
    },
  );
}
