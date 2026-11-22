import type { FilesNotSavedData } from "@houston/sdk";
import type { UnsavedFile } from "@houston/wire-types";
import { useTranslation } from "react-i18next";

function lineKey(file: UnsavedFile) {
  if (file.reason === "conflict_copy" && !file.copyPath)
    return "filesNotSaved.conflict" as const;
  return `filesNotSaved.${file.reason}` as const;
}

export function FilesNotSavedNote({ data }: { data: unknown }) {
  const { t } = useTranslation("chat");
  const files = (data as FilesNotSavedData | undefined)?.unsavedFiles?.files;
  if (!files?.length) return null;
  return (
    <div className="flex justify-center px-4 py-2">
      <div className="max-w-xl text-xs text-ink-muted break-words">
        <p>{t("filesNotSaved.title")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {files.map((file) => (
            <li key={`${file.reason}:${file.path}`}>
              {t(lineKey(file), { file: file.path, copy: file.copyPath ?? "" })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
