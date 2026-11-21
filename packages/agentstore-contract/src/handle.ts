export const HANDLE_REGEX = /^[a-z0-9][a-z0-9_]{1,29}$/;

export function normalizeHandle(raw: string): string {
  let handle = raw.trim();
  if (handle.startsWith("@")) handle = handle.slice(1);
  return handle.toLowerCase();
}

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "www",
  "houston",
  "gethouston",
  "agents",
  "agent",
  "store",
  "support",
  "help",
  "about",
  "settings",
  "me",
  "creators",
  "creator",
  "a",
  "c",
  "null",
  "undefined",
  "root",
  "moderator",
  "mod",
  "official",
  "staff",
  "team",
  "verify",
  "verified",
  "system",
  "security",
  "billing",
  "login",
  "logout",
  "signin",
  "signup",
  "dashboard",
  "explore",
]);
