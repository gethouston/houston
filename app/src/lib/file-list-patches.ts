import type { FileEntry } from "@houston-ai/agent";
import { type RowRevert, revertRows } from "./row-revert.ts";

const isUnder = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`);

const lastSegment = (path: string) => path.split("/").pop() ?? path;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

export function withoutFileEntries(
  files: FileEntry[] | undefined,
  paths: readonly string[],
): FileEntry[] | undefined {
  if (!files) return files;
  const next = files.filter((f) => !paths.some((p) => isUnder(f.path, p)));
  return next.length === files.length ? files : next;
}

export function relocateFileEntry(
  files: FileEntry[] | undefined,
  from: string,
  to: string,
): FileEntry[] | undefined {
  if (!files || from === to || !files.some((f) => f.path === from)) {
    return files;
  }
  return files.map((f) => {
    if (!isUnder(f.path, from)) return f;
    const path = `${to}${f.path.slice(from.length)}`;
    if (f.path !== from) return { ...f, path };
    const name = lastSegment(to);
    return {
      ...f,
      path,
      name,
      extension: f.is_directory ? "" : extensionOf(name),
    };
  });
}

export function replaceFileEntry(
  files: FileEntry[] | undefined,
  from: string,
  occupant: string,
): FileEntry[] | undefined {
  if (!files?.some((f) => f.path === from)) return files;
  return relocateFileEntry(
    withoutFileEntries(files, [occupant]),
    from,
    occupant,
  );
}

export function renamedPath(path: string, newName: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? newName : `${path.slice(0, slash)}/${newName}`;
}

export function withFolderEntry(
  files: FileEntry[] | undefined,
  path: string,
  now: number,
): FileEntry[] | undefined {
  if (!files || files.some((f) => f.path === path)) return files;
  const folder: FileEntry = {
    path,
    name: lastSegment(path),
    extension: "",
    size: 0,
    is_directory: true,
    dateModified: now,
    dateCreated: now,
  };
  return [folder, ...files];
}

type Listing = FileEntry[] | undefined;

export interface FileListEdit {
  apply: (files: Listing) => Listing;
  revert: (files: Listing, before: Listing) => Listing;
}

const undo =
  (spec: Omit<RowRevert<FileEntry>, "keyOf">) =>
  (files: Listing, before: Listing) =>
    revertRows(files, before, { keyOf: (f) => f.path, ...spec });

export const removalEdit = (paths: readonly string[]): FileListEdit => ({
  apply: (files) => withoutFileEntries(files, paths),
  revert: undo({ touched: (f) => paths.some((p) => isUnder(f.path, p)) }),
});

export const relocationEdit = (from: string, to: string): FileListEdit => ({
  apply: (files) => relocateFileEntry(files, from, to),
  revert: undo({
    touched: (f) => isUnder(f.path, from),
    added: (f) => isUnder(f.path, to),
  }),
});

export const replacementEdit = (
  from: string,
  occupant: string,
): FileListEdit => ({
  apply: (files) => replaceFileEntry(files, from, occupant),
  revert: undo({
    touched: (f) => isUnder(f.path, from) || isUnder(f.path, occupant),
    added: (f) => isUnder(f.path, occupant),
  }),
});

export const newFolderEdit = (path: string, now: number): FileListEdit => ({
  apply: (files) => withFolderEntry(files, path, now),
  revert: undo({ touched: () => false, added: (f) => f.path === path }),
});
