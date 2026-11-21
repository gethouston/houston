export function isExpectedClipboardRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

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
