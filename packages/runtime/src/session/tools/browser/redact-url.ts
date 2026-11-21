const SECRET_WORDS = [
  "pass",
  "pwd",
  "pswd",
  "otp",
  "token",
  "secret",
  "apikey",
  "accesskey",
  "privatekey",
  "signature",
  "ticket",
  "saml",
  "assertion",
  "auth",
  "session",
  "sessid",
  "credential",
  "verifier",
  "cookie",
  "jwt",
  "bearer",
  "pword",
];

const SECRET_TOKENS = new Set(["key", "sid", "sig", "pin", "pw"]);

const SECRET_CODE_AFTER = [
  "auth",
  "authorization",
  "verification",
  "verify",
  "otp",
  "sms",
  "mfa",
  "2fa",
  "login",
  "access",
  "security",
  "confirmation",
  "pin",
  "email",
  "device",
  "recovery",
  "backup",
  "oob",
  "reset",
  "activation",
  "onetime",
  "invite",
  "confirm",
];

const HARMLESS_NAMES = new Set([
  "footprint",
  "passenger",
  "passengers",
  "compass",
]);

export const HIDDEN = "[hidden]";

export function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

export function isSecretName(name: string): boolean {
  const flat = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!flat || HARMLESS_NAMES.has(flat)) return false;
  if (SECRET_WORDS.some((word) => flat.includes(word))) return true;
  if (nameTokens(name).some((token) => SECRET_TOKENS.has(token))) return true;
  if (!flat.endsWith("code")) return false;
  const before = flat.slice(0, -"code".length);
  return before === "" || SECRET_CODE_AFTER.some((w) => before.endsWith(w));
}

function redactPair(pair: string): string {
  const eq = pair.indexOf("=");
  if (eq < 0) return pair;
  const name = pair.slice(0, eq);
  if (isSecretName(safeDecode(name))) return `${name}=${HIDDEN}`;
  const value = safeDecode(pair.slice(eq + 1));
  if (!value.includes("=")) return pair;
  const inner = redactParams(value);
  return inner === value ? pair : `${name}=${encodeURIComponent(inner)}`;
}

function redactParams(params: string): string {
  return params
    .split(/([?&])/)
    .map((part) => (part === "?" || part === "&" ? part : redactPair(part)))
    .join("");
}

function redactPath(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      const [head, ...params] = segment.split(";");
      return [head, ...params.map(redactPair)].join(";");
    })
    .join("/");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function hidden(part: string, mark: "?" | "#"): string {
  return part.includes("=") ? `${mark}${redactParams(part.slice(1))}` : part;
}

export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (url.password) url.password = "hidden";
  let rest = url.href;
  const hash = url.hash || (rest.endsWith("#") ? "#" : "");
  rest = rest.slice(0, rest.length - hash.length);
  const search = url.search || (rest.endsWith("?") ? "?" : "");
  rest = rest.slice(0, rest.length - search.length);
  const origin = rest.slice(0, rest.length - url.pathname.length);
  const path = url.pathname.includes(";")
    ? redactPath(url.pathname)
    : url.pathname;
  return `${origin}${path}${hidden(search, "?")}${hidden(hash, "#")}`;
}
