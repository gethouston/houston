/**
 * The pure half of the Files delete confirmation: what the dialog is about,
 * and which words it asks with. Kept out of the .tsx so it can be unit-tested
 * against a stub `t` — the copy is the part that decides whether a destructive
 * question is truthful, so it is exactly the part worth a test.
 */
import type { FileEntry } from "@houston-ai/agent";
import type { TFunction } from "i18next";

/** What the confirmation is about: one named item, or a counted selection. */
export type DeleteTarget =
  | { kind: "single"; file: FileEntry }
  | { kind: "batch"; files: FileEntry[] };

/** The files a confirmed target resolves to, always as a list. */
export function targetFiles(target: DeleteTarget): FileEntry[] {
  return target.kind === "single" ? [target.file] : target.files;
}

/**
 * Title + description for the current target.
 *
 * The kebab menu deletes a thing the user just pointed at, so the question
 * NAMES it; a folder gets its own description because removing one takes
 * everything inside it, which the file wording would not warn about. The
 * selection bar deletes a set built over several clicks, so the question
 * COUNTS it instead: no name is truthful for five items.
 *
 * Called with `null` only on the very first render, before anything has been
 * requested, where the dialog is closed and its copy is never seen.
 */
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
