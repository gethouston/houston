import type { FileEntry } from "@houston-ai/agent";
import { FilesBrowser } from "@houston-ai/agent";
import type { ReactNode } from "react";
import { useState } from "react";

import { agentFiles } from "./files-browser-sample";

export function FilesStage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[480px] w-full overflow-hidden rounded-2xl border border-line bg-gutter">
      {children}
    </div>
  );
}

function renamed(files: FileEntry[], target: FileEntry, name: string) {
  const parent = target.path.includes("/")
    ? `${target.path.slice(0, target.path.lastIndexOf("/"))}/`
    : "";
  const next = `${parent}${name}`;
  return files.map((file) => {
    if (file.path === target.path) return { ...file, path: next, name };
    if (file.path.startsWith(`${target.path}/`)) {
      return { ...file, path: `${next}${file.path.slice(target.path.length)}` };
    }
    return file;
  });
}

function moved(files: FileEntry[], sourcePath: string, folder: string | null) {
  const source = files.find((file) => file.path === sourcePath);
  if (!source) return files;
  const next = folder ? `${folder}/${source.name}` : source.name;
  if (next === sourcePath) return files;
  return files.map((file) => {
    if (file.path === sourcePath) return { ...file, path: next };
    if (file.path.startsWith(`${sourcePath}/`)) {
      return { ...file, path: `${next}${file.path.slice(sourcePath.length)}` };
    }
    return file;
  });
}

export interface LiveFilesProps {
  initial?: FileEntry[];
  loading?: boolean;
}

export function LiveFiles({ initial = agentFiles, loading }: LiveFilesProps) {
  const [files, setFiles] = useState(initial);

  return (
    <FilesStage>
      <FilesBrowser
        files={files}
        loading={loading}
        onRename={(file, name) => setFiles((all) => renamed(all, file, name))}
        onDelete={(file) =>
          setFiles((all) =>
            all.filter(
              (one) =>
                one.path !== file.path && !one.path.startsWith(`${file.path}/`),
            ),
          )
        }
        onCreateFolder={(name) =>
          setFiles((all) => [
            ...all,
            {
              path: name,
              name: name.split("/").pop() ?? name,
              extension: "",
              size: 0,
              is_directory: true,
              dateModified: Date.UTC(2026, 6, 28, 10, 0),
              dateCreated: Date.UTC(2026, 6, 28, 10, 0),
            },
          ])
        }
        onMove={(sourcePath, folder) =>
          setFiles((all) => moved(all, sourcePath, folder))
        }
      />
    </FilesStage>
  );
}
