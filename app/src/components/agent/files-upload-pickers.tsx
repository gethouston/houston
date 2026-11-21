import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";
import { useRef } from "react";

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
    e.currentTarget.value = "";
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
