export class ObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ObjectTooLargeError";
  }
}

export class ObjectNotFoundError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ObjectNotFoundError";
  }
}

export class StoreFencedError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "StoreFencedError";
  }
}

export class StoreConflictError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class ObjectWriteRefusedError extends ObjectTooLargeError {
  constructor(key: string, message: string) {
    super(key, message);
    this.name = "ObjectWriteRefusedError";
  }
}

export class ObjectAttrsRefusedError extends ObjectWriteRefusedError {
  constructor(key: string, message: string) {
    super(key, message);
    this.name = "ObjectAttrsRefusedError";
  }
}
