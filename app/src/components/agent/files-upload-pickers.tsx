import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";
import { useRef } from "react";

/**
 * The Files section's two hidden pickers (files, whole folder) and the triggers
 * that open them.
 *
 * The OS picker reports back long after it was opened, so the folder the user
 * had open rides along in a ref until `change` fires and the batch can be
 * ingested into it. Without that, every button-initiated upload landed at the
 * workspace root while drag-and-drop correctly targeted the open folder. Null
 * is the root: the empty-workspace CTA, and any pick started from there.
 */

// Non-standard attribute (WebKit lineage, supported by every engine we ship
// on): turns the picker into a directory picker. Unknown to React's typings,
// hence the cast; engines without it fall back to a plain file picker.
const FOLDER_INPUT_PROPS = {
  webkitdirectory: "",
} as InputHTMLAttributes<HTMLInputElement>;

export function useFilesUploadPickers(
  ingest: (files: File[], targetDir?: string | null) => void,
): {
  pickFiles: (targetFolder?: string) => void;
  pickFolder: (targetFolder?: string) => void;
  inputs: ReactNode;
} {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const targetDir = useRef<string | null>(null);

  const open =
    (input: typeof fileInput) =>
    (targetFolder?: string): void => {
      targetDir.current = targetFolder ?? null;
      input.current?.click();
    };
  const pickFiles = open(fileInput);
  const pickFolder = open(folderInput);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    ingest(Array.from(e.currentTarget.files ?? []), targetDir.current);
    e.currentTarget.value = ""; // allow re-picking the same file or folder
  };

  const inputs = (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={onChange}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        onChange={onChange}
        {...FOLDER_INPUT_PROPS}
      />
    </>
  );

  return { pickFiles, pickFolder, inputs };
}
