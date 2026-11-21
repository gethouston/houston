import { createHash, createPublicKey, verify } from "node:crypto";

const decodeText = (b64, what) => {
  const text = Buffer.from(b64.trim(), "base64").toString("utf8");
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines.length < 2) throw new Error(`${what} is not a minisign file`);
  return lines;
};

const ed25519Key = (raw) =>
  createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") },
    format: "jwk",
  });

/**
 * @param {{ pubkey: string, signature: string, data: Buffer }} input
 *   pubkey and signature exactly as tauri.conf.json and the .sig file hold them.
 * @returns {{ keyId: string, trustedComment: string }}
 */
export function verifyUpdaterSignature({ pubkey, signature, data }) {
  const keyBytes = Buffer.from(decodeText(pubkey, "pubkey")[1], "base64");
  if (keyBytes.length !== 42 || keyBytes.subarray(0, 2).toString() !== "Ed") {
    throw new Error("pubkey is not an Ed25519 minisign key");
  }
  const keyId = keyBytes.subarray(2, 10);
  const key = ed25519Key(keyBytes.subarray(10));

  const lines = decodeText(signature, "signature");
  const sigBytes = Buffer.from(lines[1], "base64");
  const trustedPrefix = "trusted comment: ";
  if (sigBytes.length !== 74 || !lines[2]?.startsWith(trustedPrefix)) {
    throw new Error("signature is not a minisign signature");
  }
  const algorithm = sigBytes.subarray(0, 2).toString();
  if (algorithm !== "ED" && algorithm !== "Ed") {
    throw new Error(`unknown signature algorithm ${algorithm}`);
  }
  if (!sigBytes.subarray(2, 10).equals(keyId)) {
    throw new Error(
      `signed by key ${sigBytes.subarray(2, 10).toString("hex")}, expected ${keyId.toString("hex")}`,
    );
  }
  const sig = sigBytes.subarray(10);
  const message =
    algorithm === "ED" ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, message, key, sig)) {
    throw new Error("signature does not match the file");
  }

  const trustedComment = lines[2].slice(trustedPrefix.length);
  const globalSig = Buffer.from(lines[3] ?? "", "base64");
  const signed = Buffer.concat([sig, Buffer.from(trustedComment, "utf8")]);
  if (globalSig.length !== 64 || !verify(null, signed, key, globalSig)) {
    throw new Error("trusted comment signature is invalid");
  }
  return { keyId: keyId.toString("hex"), trustedComment };
}
