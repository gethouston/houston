import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  canonicalManifest,
  type UpdateManifestBody,
} from "../src/updates/manifest";

export function signManifest(body: UpdateManifestBody, pem: string): string {
  if (!pem.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("OTA signing key must use PKCS8 PEM encoding");
  }
  const key = createPrivateKey(pem);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("OTA signing key must be ECDSA P-256 PKCS8");
  }
  return sign("sha256", Buffer.from(canonicalManifest(body)), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64");
}

if (process.argv[1]?.endsWith("sign-update.ts")) {
  const [zipPath, versionPath, compatPath, channel, baseUrl, outputPath] =
    process.argv.slice(2);
  const pem = process.env.HOUSTON_MOBILE_UPDATE_SIGNING_KEY;
  const sequence = Number(process.env.HOUSTON_MOBILE_UPDATE_SEQUENCE);
  if (
    !zipPath ||
    !versionPath ||
    !compatPath ||
    !channel ||
    !baseUrl ||
    !outputPath ||
    !pem ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error(
      "Usage: sign-update.ts ZIP VERSION_JSON COMPAT_JSON CHANNEL BASE_URL MANIFEST_JSON; set HOUSTON_MOBILE_UPDATE_SIGNING_KEY and HOUSTON_MOBILE_UPDATE_SEQUENCE",
    );
  }
  if (channel !== "production" && channel !== "preview")
    throw new Error("Invalid OTA channel");
  const versionFile = JSON.parse(readFileSync(versionPath, "utf8")) as {
    version: string;
    bundle_sequence: number;
  };
  const version = versionFile.version;
  const compat = JSON.parse(readFileSync(compatPath, "utf8")) as {
    min_native_build: number;
    required_native_build: number;
  };
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+[0-9a-f]{7,}$/.test(version)) {
    throw new Error("Invalid OTA bundle version");
  }
  if (
    !Number.isSafeInteger(versionFile.bundle_sequence) ||
    versionFile.bundle_sequence < 1 ||
    versionFile.bundle_sequence > sequence
  )
    throw new Error("Invalid OTA bundle sequence");
  if (
    !Number.isSafeInteger(compat.min_native_build) ||
    compat.min_native_build < 1 ||
    !Number.isSafeInteger(compat.required_native_build) ||
    compat.required_native_build < 1
  ) {
    throw new Error("Invalid native compatibility floors");
  }
  if (new URL(baseUrl).protocol !== "https:")
    throw new Error("OTA base URL must be HTTPS");
  const sha256 = createHash("sha256")
    .update(readFileSync(zipPath))
    .digest("hex");
  const url = new URL(
    `${channel}/${version}.zip`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).href;
  const body: UpdateManifestBody = {
    v: 1,
    channel,
    sequence,
    bundle_sequence: versionFile.bundle_sequence,
    version,
    url,
    sha256,
    min_native_build: compat.min_native_build,
    required_native_build: compat.required_native_build,
    published_at: new Date().toISOString(),
  };
  writeFileSync(
    outputPath,
    `${JSON.stringify({ ...body, signature: signManifest(body, pem) })}\n`,
  );
}
