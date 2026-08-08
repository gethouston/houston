import type { FileEntry, FilesViewMode } from "@houston-ai/agent";
import { FilesBrowser } from "@houston-ai/agent";
import type { ReactNode } from "react";
import { useState } from "react";

import { agentFiles } from "./files-browser-sample";

/** The browser is `h-full` — a specimen has to hand it a window. */
export function FilesStage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[480px] w-full overflow-hidden rounded-2xl border border-line bg-gutter">
      {children}
    </div>
  );
}

/** Rename in place: the entry's own path moves, and so does everything under it
 *  when the renamed entry is a folder. */
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

/** Move one entry (and its subtree) into `folder`, or to the root on null. */
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
  /** Seed content; `[]` gives the empty state. */
  initial?: FileEntry[];
  /** Start in the Finder-style list instead of the card grid. */
  startView?: FilesViewMode;
  /** Render the loading line instead of a body. */
  loading?: boolean;
}

/**
 * `FilesBrowser` wired the way the Files section wires it: selection, the view
 * toggle, inline rename, delete, new folder and internal drag-and-drop all move
 * real state, so every gesture here behaves as it does in the product. The
 * host-only actions (reveal in the OS, download) are deliberately absent —
 * see the page's note.
 */
export function LiveFiles({
  initial = agentFiles,
  startView = "grid",
  loading,
}: LiveFilesProps) {
  const [files, setFiles] = useState(initial);
  const [view, setView] = useState<FilesViewMode>(startView);

  return (
    <FilesStage>
      <FilesBrowser
        files={files}
        loading={loading}
        view={view}
        onViewChange={setView}
        rootLabel="Inbox Zero"
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
