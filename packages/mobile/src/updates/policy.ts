export interface StoredPolicy {
  sequence: number;
  required_native_build: number;
}

export function parseStoredPolicy(raw: string | null): StoredPolicy | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("sequence" in value) ||
    !("required_native_build" in value) ||
    !Number.isSafeInteger(value.sequence) ||
    !Number.isSafeInteger(value.required_native_build)
  )
    throw new Error("Invalid stored OTA policy");
  return {
    sequence: value.sequence as number,
    required_native_build: value.required_native_build as number,
  };
}

export function serializePolicy(policy: StoredPolicy): string {
  return JSON.stringify({
    sequence: policy.sequence,
    required_native_build: policy.required_native_build,
  });
}
