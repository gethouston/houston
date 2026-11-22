import {
  parseUnsavedFiles,
  type UnsavedFilesReport,
  userVisibleUnsavedFiles,
} from "@houston/wire-types";
import { push, type TurnState } from "./turn-settle";

export const FILES_NOT_SAVED_MESSAGE =
  "Some files from this reply could not be saved:";

export interface FilesNotSavedData {
  unsavedFiles: UnsavedFilesReport;
}

export function filesNotSavedNotice(
  report: UnsavedFilesReport | null | undefined,
):
  | {
      feed_type: "system_message";
      data: string;
      notice: "files_not_saved";
      noticeData: FilesNotSavedData;
    }
  | undefined {
  const files = userVisibleUnsavedFiles(report);
  if (!report || files.length === 0) return undefined;
  return {
    feed_type: "system_message",
    data: `${FILES_NOT_SAVED_MESSAGE} ${files.map((file) => file.path).join(", ")}`,
    notice: "files_not_saved",
    noticeData: { unsavedFiles: { ...report, files } },
  };
}

export function pushFilesNotSaved(s: TurnState, data: unknown): void {
  const notice = filesNotSavedNotice(parseUnsavedFiles(data));
  if (notice) push(s, notice);
}
