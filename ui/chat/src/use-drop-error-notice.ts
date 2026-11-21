import { TooManyAttachmentFilesError } from "@houston-ai/core";
import { useCallback } from "react";
import type { ChatComposerLabels } from "./chat-panel-types";
import { DEFAULT_TOO_MANY_FILES_NOTICE } from "./use-attachment-intake";

export function useDropErrorNotice(
  onNotice: ((message: string) => void) | undefined,
  labels: ChatComposerLabels | undefined,
): (error: unknown) => void {
  const tooManyFilesNotice = labels?.tooManyFiles;
  const folderReadFailedNotice = labels?.folderReadFailed;
  return useCallback(
    (error: unknown) => {
      if (!onNotice) throw error;
      onNotice(
        error instanceof TooManyAttachmentFilesError
          ? (tooManyFilesNotice ?? DEFAULT_TOO_MANY_FILES_NOTICE)
          : (folderReadFailedNotice ??
              "Couldn't read the dropped folder. Try the attach button instead."),
      );
    },
    [onNotice, tooManyFilesNotice, folderReadFailedNotice],
  );
}
