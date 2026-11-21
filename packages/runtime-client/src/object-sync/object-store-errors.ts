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
