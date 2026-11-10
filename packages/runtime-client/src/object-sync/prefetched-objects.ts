import { type ObjectMetadata, parseObjectManifest } from "./object-manifest";

/** The scope rule a gateway's scoped listing follows; a worker that does
 *  not know the named rule lists the store itself. */
export const CLAIMED_TURN_LISTING_SCOPE = "claimed-turn/1";

/** A listing of only what one claimed turn reads before its prompt, under
 *  one agent tree (runtime turn-store-scope.ts names the rule). */
export interface ScopedListing {
  scope: string;
  agentRoot: string;
  objects: ObjectMetadata[];
}

/** What the dispatcher shipped inside the turn: a listing (the whole store,
 *  or a scoped one) plus the bytes of the objects it chose to inline. */
export interface PrefetchedObjects {
  /** The whole store, recursively. */
  manifest?: ObjectMetadata[];
  listing?: ScopedListing;
  objects: Map<string, { data: Buffer; generation?: string }>;
}

function parseScopedListing(value: unknown): ScopedListing | undefined {
  if (value === undefined) return undefined;
  const raw = value as { scope?: unknown; agentRoot?: unknown };
  if (typeof raw.scope !== "string" || typeof raw.agentRoot !== "string")
    throw new Error("turn prefetch listing is malformed");
  return {
    scope: raw.scope,
    agentRoot: raw.agentRoot,
    objects: parseObjectManifest(value, "turn prefetch listing"),
  };
}

/** Parse the envelope's `prefetch`. Anything malformed is dropped rather
 *  than failing the turn: the store can always be read directly. */
export function parsePrefetchedObjects(
  value: unknown,
): PrefetchedObjects | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as {
    manifest?: unknown;
    listing?: unknown;
    objects?: unknown;
  };
  try {
    const listing = parseScopedListing(raw.listing);
    // An older gateway always sends the whole listing; a newer one may send
    // only the scoped one. Neither: nothing says what the objects are.
    const manifest =
      raw.manifest === undefined && listing
        ? undefined
        : parseObjectManifest({ objects: raw.manifest }, "turn prefetch");
    const objects = new Map<string, { data: Buffer; generation?: string }>();
    if (raw.objects && typeof raw.objects === "object") {
      for (const [key, entry] of Object.entries(raw.objects)) {
        const object = entry as { data?: unknown; generation?: unknown };
        if (typeof object.data !== "string") continue;
        objects.set(key, {
          data: Buffer.from(object.data, "base64"),
          ...(typeof object.generation === "string" && object.generation !== "0"
            ? { generation: object.generation }
            : {}),
        });
      }
    }
    return {
      ...(manifest ? { manifest } : {}),
      ...(listing ? { listing } : {}),
      objects,
    };
  } catch {
    return undefined;
  }
}
