import { generateKeyPairSync, webcrypto } from "node:crypto";
import { expect, test } from "vitest";
import {
  type UpdateManifestBody,
  verifyManifest,
} from "../src/updates/manifest";
import { signManifest } from "./sign-update";

test("signer emits canonical P1363 signatures verified by the app", async () => {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const pubkey = keys.publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const body: UpdateManifestBody = {
    v: 1,
    version: "0.5.41+abc1234",
    url: "https://storage.googleapis.com/houston-mobile-updates/production/a.zip",
    sha256: "a".repeat(64),
    min_native_build: 2,
    required_native_build: 2,
    published_at: "2026-10-08T00:00:00.000Z",
  };
  const signed = { ...body, signature: signManifest(body, pem) };
  expect(Buffer.from(signed.signature, "base64")).toHaveLength(64);
  await expect(
    verifyManifest(
      signed,
      "https://storage.googleapis.com/houston-mobile-updates",
      pubkey,
      webcrypto.subtle as SubtleCrypto,
    ),
  ).resolves.toEqual(signed);
  await expect(
    verifyManifest(
      { ...signed, required_native_build: 3 },
      "https://storage.googleapis.com/houston-mobile-updates",
      pubkey,
      webcrypto.subtle as SubtleCrypto,
    ),
  ).rejects.toThrow("signature");
});
