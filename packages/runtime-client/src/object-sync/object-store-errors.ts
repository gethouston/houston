/**
 * The store's deterministic verdict that ONE object exceeds its per-object cap
 * (the gateway's 413 over GW_BLOB_MAX_OBJECT_MB). Unlike a transient failure,
 * re-uploading the same bytes can never succeed — syncBack skips the object
 * and keeps the pass alive instead of letting one oversized file block every
 * other file's persistence (HOUSTON-APP-4Y7). Adapters raise it from upload.
 */
export class ObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ObjectTooLargeError";
  }
}

/**
 * The object vanished between a listing and this request: another writer
 * deleted it. Readers treat it as an absent key, never a failure — a stale
 * manifest entry must not fail a whole turn (HOUSTON-APP-5AS).
 */
export class ObjectNotFoundError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ObjectNotFoundError";
  }
}

/** The gateway rejected a stale pod after another boot acquired the lease. */
export class StoreFencedError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "StoreFencedError";
  }
}

/** A generation precondition missed because the remote object changed. */
export class StoreConflictError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class ObjectAttrsRefusedError extends ObjectTooLargeError {
  constructor(key: string, message: string) {
    super(key, message);
    this.name = "ObjectAttrsRefusedError";
  }
}
