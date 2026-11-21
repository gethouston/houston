import { isTransientEngineError } from "./transient-error.ts";

export const PUSH_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

export const isTransientPushError = isTransientEngineError;
