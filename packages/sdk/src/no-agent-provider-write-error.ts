export class NoAgentForProviderWriteError extends Error {
  constructor() {
    super("Create an agent first, then connect its account.");
    this.name = "NoAgentForProviderWriteError";
  }
}

export function isNoAgentForProviderWriteError(e: unknown): boolean {
  return e instanceof NoAgentForProviderWriteError;
}
