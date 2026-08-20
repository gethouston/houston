import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TextStore } from "@houston/domain";

/** Domain TextStore over the hydrated turn tree (absolute-path keys). */
export function fsTextStore(): TextStore {
  return {
    async readText(key: string): Promise<string | null> {
      try {
        return await readFile(key, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async writeText(key: string, content: string): Promise<void> {
      await mkdir(dirname(key), { recursive: true });
      await writeFile(key, content, "utf8");
    },
  };
}
