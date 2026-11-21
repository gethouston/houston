import type {
  HydrateManifest,
  ObjectMetadata,
  ObjectStore,
} from "@houston/runtime-client/object-sync";

export const UNREAD_HASH = "unread:owned-without-download";

export class LazyReadRefusedError extends Error {
  constructor(
    readonly reason: "object" | "total" | "private",
    readonly key: string,
    readonly size: number,
    readonly maxBytes: number,
  ) {
    super(refusalMessage(reason, key, size, maxBytes));
    this.name = "LazyReadRefusedError";
  }
}

function refusalMessage(
  reason: LazyReadRefusedError["reason"],
  key: string,
  size: number,
  maxBytes: number,
): string {
  switch (reason) {
    case "object":
      return `${key} is ${size} bytes, over the ${maxBytes}-byte cap for a read while the agent sleeps`;
    case "total":
      return `reading ${key} (${size} bytes) would exceed the ${maxBytes}-byte budget of this operation`;
    case "private":
      return `${key} was not read: its private directory is not this process's own`;
  }
}

export interface LazyStoreVfsOptions {
  store: ObjectStore;
  prefix: string;
  root: string;
  objects: ObjectMetadata[];
  manifest: HydrateManifest;
  excludes: string[];
  maxObjectBytes: number;
  maxBytes: number;
}
