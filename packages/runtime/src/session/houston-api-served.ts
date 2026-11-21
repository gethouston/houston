import { readUnservedOperations } from "@houston/domain/assistant-deployment";

export const HOUSTON_API_KEY_OPERATIONS = [
  "listApiKeys",
  "createApiKey",
  "revokeApiKey",
] as const;

export function houstonApiServedHere(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const unserved = readUnservedOperations(env);
  return !HOUSTON_API_KEY_OPERATIONS.some((name) => unserved.has(name));
}
