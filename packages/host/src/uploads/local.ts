import { randomBytes } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { atomicTempPath, isAtomicTemp } from "@houston/protocol";
import type { OpenUploadRequest, UploadSession } from "@houston/wire-types";
import { uploadIdSchema } from "@houston/wire-types";
import {
  UPLOAD_CHUNK_BYTES,
  UPLOAD_TTL_MS,
  UploadError,
  type UploadIdentity,
  type UploadMeta,
} from "./types";

/** Staging is outside the workspace and never enters its listing or sync. */
export class LocalUploadSessions {
  private readonly busy = new Set<string>();
  private opening: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory: string,
    private readonly now = Date.now,
  ) {}

  path(id: string, suffix: "part" | "done" | "json"): string {
    return join(this.directory, `${id}.${suffix}`);
  }

  async sweep(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    for (const file of await readdir(this.directory)) {
      const match = /^([A-Za-z0-9_-]{16,128})\.(json|part|done)(?:\.|$)/.exec(
        file,
      );
      if (!match?.[1] || this.busy.has(match[1])) continue;
      const isEntry = ["json", "part", "done"].some(
        (suffix) => file === `${match[1]}.${suffix}`,
      );
      if (!isEntry && !isAtomicTemp(file)) continue;
      const info = await stat(join(this.directory, file)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        },
      );
      if (info && this.now() - info.mtimeMs >= UPLOAD_TTL_MS) {
        await this.remove(match[1]);
        if (isAtomicTemp(file))
          await rm(join(this.directory, file), { force: true });
      }
    }
  }

  open(
    request: OpenUploadRequest,
    identity: Omit<UploadIdentity, "purpose">,
  ): Promise<UploadSession> {
    const run = this.opening.then(async () => {
      await this.sweep();
      let count = 0;
      for (const file of await readdir(this.directory)) {
        if (!file.endsWith(".json")) continue;
        const meta = await this.meta(file.slice(0, -5));
        if (meta?.owner === identity.owner) count++;
      }
      if (count >= 16) throw new UploadError("too_many_uploads");
      const uploadId = randomBytes(24).toString("base64url");
      const createdAt = this.now();
      const meta: UploadMeta = { ...request, ...identity, createdAt };
      await writeFile(this.path(uploadId, "part"), Buffer.alloc(0), {
        flag: "wx",
      });
      const metadataPath = this.path(uploadId, "json");
      const temp = atomicTempPath(metadataPath, uploadId);
      await writeFile(temp, JSON.stringify(meta), { flag: "wx" });
      await rename(temp, metadataPath);
      return {
        uploadId,
        uploadUrl: `/v1/uploads/${uploadId}`,
        chunkBytes: UPLOAD_CHUNK_BYTES,
        expiresAt: new Date(createdAt + UPLOAD_TTL_MS).toISOString(),
      };
    });
    this.opening = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async meta(id: string): Promise<UploadMeta | null> {
    if (!uploadIdSchema.safeParse(id).success) return null;
    try {
      const meta: UploadMeta = JSON.parse(
        await readFile(this.path(id, "json"), "utf8"),
      );
      return this.now() - meta.createdAt >= UPLOAD_TTL_MS ? null : meta;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async offset(id: string): Promise<{ size: number; complete: boolean }> {
    for (const suffix of ["done", "part"] as const) {
      try {
        return {
          size: (await stat(this.path(id, suffix))).size,
          complete: suffix === "done",
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new UploadError("upload_not_found");
  }

  async require(id: string, identity: UploadIdentity): Promise<string> {
    const meta = await this.meta(id);
    if (
      !meta ||
      meta.agentId !== identity.agentId ||
      meta.owner !== identity.owner ||
      meta.workspace !== identity.workspace ||
      meta.purpose !== identity.purpose
    )
      throw new UploadError("upload_not_found");
    const state = await this.offset(id);
    if (!state.complete || state.size !== meta.size)
      throw new UploadError("upload_incomplete");
    return this.path(id, "done");
  }

  async remove(id: string): Promise<void> {
    await Promise.all(
      ["part", "done", "json"].map((suffix) =>
        rm(join(this.directory, `${id}.${suffix}`), { force: true }),
      ),
    );
  }

  /** One writer per session; a retry observes only bytes its predecessor closed. */
  async exclusive<T>(
    id: string,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    if (this.busy.has(id)) return null;
    this.busy.add(id);
    try {
      return await operation();
    } finally {
      this.busy.delete(id);
    }
  }
}
