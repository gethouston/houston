import { NAME_TAKEN, READ_ONLY } from "@houston/protocol";
import {
  type KeyCase,
  type Vfs,
  VfsExistsError,
  VfsReadOnlyError,
} from "../vfs";
import { FileOpError } from "./files-path";

export class WorkspaceKeys {
  private readonly names = new Set<string>();

  constructor(
    readonly keyCase: KeyCase,
    keys: Iterable<string>,
  ) {
    for (const key of keys) this.add(key);
  }

  private compare(key: string): string {
    const cased = this.keyCase.fold === "folded" ? key.toLowerCase() : key;
    return this.keyCase.normalize ? cased.normalize("NFC") : cased;
  }

  add(key: string): void {
    this.names.add(this.compare(key));
  }

  has(key: string): boolean {
    return this.names.has(this.compare(key));
  }

  taken(key: string): boolean {
    if (this.has(key)) return true;
    const prefix = this.compare(`${key}/`);
    for (const name of this.names) if (name.startsWith(prefix)) return true;
    return false;
  }

  sameSlot(a: string, b: string): boolean {
    return this.compare(a) === this.compare(b);
  }
}

export async function loadWorkspaceKeys(
  vfs: Vfs,
  root: string,
): Promise<WorkspaceKeys> {
  const [keyCase, stats] = await Promise.all([
    vfs.keyCase(),
    vfs.listDetailed(root),
  ]);
  return new WorkspaceKeys(
    keyCase,
    stats.map((s) => s.key),
  );
}

export function readOnlyRefusal(err: unknown): FileOpError | null {
  return err instanceof VfsReadOnlyError
    ? new FileOpError(403, "this workspace is read-only", READ_ONLY)
    : null;
}

export async function moveOrRefuse(
  vfs: Vfs,
  fromKey: string,
  toKey: string,
  name: string,
): Promise<void> {
  try {
    await vfs.move(fromKey, toKey);
  } catch (err) {
    if (err instanceof VfsExistsError) {
      throw new FileOpError(409, `"${name}" already exists there`, NAME_TAKEN);
    }
    throw err;
  }
}
