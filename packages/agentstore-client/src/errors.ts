export class StoreApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    code: string | null,
    body: unknown,
  ) {
    super(message, body instanceof Error ? { cause: body } : undefined);
    this.name = "StoreApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}
