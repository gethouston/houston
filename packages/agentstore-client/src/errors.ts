/**
 * The single error class the Agent Store SDK throws. Every consumer imports it
 * from this one module so `err instanceof StoreApiError` holds across bundles
 * (identity diverges the moment the class is duplicated). It carries the machine
 * fields a UI branches on — the HTTP `status`, the gateway `{error}` `code` token
 * when present, and the raw parsed `body` — so callers never string-match prose.
 */
export class StoreApiError extends Error {
  /** The HTTP status of the failed response; `0` marks a network-level failure. */
  readonly status: number;
  /**
   * The gateway's machine token, taken from the `{error}` (or explicit `code`)
   * field of a JSON error envelope; `null` when the body carried no such token.
   */
  readonly code: string | null;
  /**
   * The response payload as observed: the parsed JSON object when the body was
   * JSON, the raw text otherwise, or the thrown error on a network failure.
   */
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    code: string | null,
    body: unknown,
  ) {
    super(message);
    this.name = "StoreApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}
