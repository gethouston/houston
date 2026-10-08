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
  if (
    !zipPath ||
    !versionPath ||
    !compatPath ||
    !channel ||
    !baseUrl ||
    !outputPath ||
    !pem
  ) {
    throw new Error(
      "Usage: sign-update.ts ZIP VERSION_JSON COMPAT_JSON CHANNEL BASE_URL MANIFEST_JSON; set HOUSTON_MOBILE_UPDATE_SIGNING_KEY",
    );
  }
  if (channel !== "production" && channel !== "preview")
    throw new Error("Invalid OTA channel");
  const version = (
    JSON.parse(readFileSync(versionPath, "utf8")) as { version: string }
  ).version;
  const compat = JSON.parse(readFileSync(compatPath, "utf8")) as {
    min_native_build: number;
    required_native_build: number;
  };
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+[0-9a-f]{7,}$/.test(version)) {
    throw new Error("Invalid OTA bundle version");
  }
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
