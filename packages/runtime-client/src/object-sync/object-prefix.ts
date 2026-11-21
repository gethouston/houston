const MAX_KEY_BYTES = 1024;

export function isObjectPrefix(prefix: string): boolean {
  if (prefix === "") return true;
  if (new TextEncoder().encode(prefix).byteLength > MAX_KEY_BYTES) return false;
  if (prefix.startsWith("/") || prefix.includes("\\")) return false;
  if (/\p{Cc}/u.test(prefix)) return false;
  return prefix
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function underObjectPrefix(key: string, prefix: string): boolean {
  return prefix === "" || key.startsWith(`${prefix}/`);
}

export class InvalidObjectPrefixError extends Error {
  constructor(readonly prefix: string) {
    super(
      `invalid object prefix ${JSON.stringify(prefix)}: name a directory without a trailing slash`,
    );
    this.name = "InvalidObjectPrefixError";
  }
}
