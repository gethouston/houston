import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { CustomIntegrationDef } from "./types";

/**
 * Persistence for custom-integration DEFINITIONS (no secret material — secret
 * values live in the CustomSecretStore; definitions carry only secret IDs).
 * File lives next to the host's credentials file (user-level, not per-agent):
 * custom integrations belong to the user, like Composio connections.
 */
export interface CustomIntegrationStore {
  list(): Promise<CustomIntegrationDef[]>;
  /** Insert or replace by slug (callers validate slugs). */
  put(def: CustomIntegrationDef): Promise<void>;
  /** Remove by slug; removing an absent slug is a no-op. */
  remove(slug: string): Promise<void>;
}

/** In-memory store for tests. */
export class MemoryCustomIntegrationStore implements CustomIntegrationStore {
  private readonly bySlug = new Map<string, CustomIntegrationDef>();

  async list(): Promise<CustomIntegrationDef[]> {
    return [...this.bySlug.values()];
  }

  async put(def: CustomIntegrationDef): Promise<void> {
    this.bySlug.set(def.slug, def);
  }

  async remove(slug: string): Promise<void> {
    this.bySlug.delete(slug);
  }
}

interface FileShape {
  version: 1;
  items: CustomIntegrationDef[];
}

/**
 * File-backed store (atomic tmp+rename, like the grant store). A missing file
 * reads as empty. A CORRUPT file throws: definitions are user-created state, so
 * silently reading them as "none" would make every custom integration vanish
 * without a trace — surfacing the parse failure is the no-silent-failures call.
 */
export class FileCustomIntegrationStore implements CustomIntegrationStore {
  constructor(private readonly path: string) {}

  private read(): FileShape {
    if (!existsSync(this.path)) return { version: 1, items: [] };
    const raw = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(raw) as FileShape;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
      throw new Error(
        `custom-integrations: unrecognized definitions file shape at ${this.path}`,
      );
    }
    return parsed;
  }

  private write(shape: FileShape): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(shape, null, 2)}\n`, "utf8");
    renameSync(tmp, this.path);
  }

  async list(): Promise<CustomIntegrationDef[]> {
    return this.read().items;
  }

  async put(def: CustomIntegrationDef): Promise<void> {
    const shape = this.read();
    const items = shape.items.filter((d) => d.slug !== def.slug);
    items.push(def);
    this.write({ version: 1, items });
  }

  async remove(slug: string): Promise<void> {
    const shape = this.read();
    this.write({
      version: 1,
      items: shape.items.filter((d) => d.slug !== slug),
    });
  }
}
