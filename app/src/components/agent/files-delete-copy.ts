import type { FileEntry } from "@houston-ai/agent";
import type { TFunction } from "i18next";

export type DeleteTarget =
  | { kind: "single"; file: FileEntry }
  | { kind: "batch"; files: FileEntry[] };

export function targetFiles(target: DeleteTarget): FileEntry[] {
  return target.kind === "single" ? [target.file] : target.files;
}

export function deleteCopy(
  target: DeleteTarget | null,
  t: TFunction<"agents">,
): { title: string; description: string } {
  if (target?.kind === "batch") {
    const count = target.files.length;
    return {
      title: t("files.delete.batchTitle", { count }),
      description: t("files.delete.batchDescription", { count }),
    };
  }
  const file = target?.file;
  return {
    title: t("files.delete.title", { name: file?.name ?? "" }),
    description:
      file?.is_directory === true
        ? t("files.delete.folderDescription")
        : t("files.delete.fileDescription"),
  };
}
