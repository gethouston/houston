export interface UpdateManifestBody {
  v: 1;
  channel: "production" | "preview";
  sequence: number;
  bundle_sequence: number;
  version: string;
  url: string;
  sha256: string;
  min_native_build: number;
  required_native_build: number;
  published_at: string;
}

export interface UpdateManifest extends UpdateManifestBody {
  signature: string;
}

const bodyKeys = [
  "bundle_sequence",
  "channel",
  "min_native_build",
  "published_at",
  "required_native_build",
  "sequence",
  "sha256",
  "url",
  "v",
  "version",
] as const;

export function canonicalManifest(body: UpdateManifestBody): string {
  return JSON.stringify(
    Object.fromEntries(bodyKeys.map((key) => [key, body[key]])),
  );
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid base64");
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function verifyManifest(
  raw: unknown,
  baseUrl: string,
  publicKey: string,
  cryptoApi: SubtleCrypto = crypto.subtle,
): Promise<UpdateManifest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid OTA manifest");
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(",") !==
      [...bodyKeys, "signature"].sort().join(",") ||
    value.v !== 1 ||
    (value.channel !== "production" && value.channel !== "preview") ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 ||
    !Number.isSafeInteger(value.bundle_sequence) ||
    (value.bundle_sequence as number) < 1 ||
    (value.bundle_sequence as number) > (value.sequence as number) ||
    typeof value.version !== "string" ||
    !value.version ||
    typeof value.url !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(value.sha256) ||
    typeof value.published_at !== "string" ||
    !Number.isFinite(Date.parse(value.published_at)) ||
    !Number.isSafeInteger(value.min_native_build) ||
    !Number.isSafeInteger(value.required_native_build) ||
    (value.min_native_build as number) < 1 ||
    (value.required_native_build as number) < 1 ||
    typeof value.signature !== "string"
  )
    throw new Error("Invalid OTA manifest fields");
  const url = new URL(value.url);
  const base = new URL(baseUrl);
  if (
    url.protocol !== "https:" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(
      `${base.pathname.replace(/\/$/, "")}/${value.channel}/`,
    )
  ) {
    throw new Error("OTA bundle URL is outside update base");
  }
  const manifest = value as unknown as UpdateManifest;
  const { signature, ...body } = manifest;
  const key = await cryptoApi.importKey(
    "spki",
    decodeBase64(publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  // WebCrypto ECDSA expects IEEE P1363 r||s, not ASN.1 DER.
  const valid = await cryptoApi.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    decodeBase64(signature),
    new TextEncoder().encode(canonicalManifest(body)),
  );
  if (!valid) throw new Error("Invalid OTA manifest signature");
  return manifest;
}
