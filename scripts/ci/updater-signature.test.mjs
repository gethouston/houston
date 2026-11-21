import { describe, expect, it } from "vitest";
import { verifyUpdaterSignature } from "./updater-signature.mjs";

const PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY5RERDMDJGNkMwMTVBNkEKUldScVdnRnNMOERkYVFZeU5ZM2tZdnN6NEVMaU5vSFNya3FLb25FMjE5QWRIdmhoelJiWG9BSFMK";
const OTHER_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEIyNzhCOUVBQjM0MEFERTAKUldUZ3JVQ3o2cmw0c2tMMVg2NUx1aEI0SG5Ob21sdzdGSTBId3FlR2xicDlTaEdheVZyV0k1K2EK";
const SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVScVdnRnNMOERkYVZjUDR5alpHcktERWR4QmZMMmhPbTh4bGEvV3FKZDU0a3pLak9JcE4vdXVDQmJnaDRCam1UcFM3c0VjU3NRSDlnMmZkbXJvTnc4VUgvbUxBdEtTekFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkxNDY5Nzk2CWZpbGU6Zml4dHVyZS50eHQKL2l3L1ZyVm9Yb3JPVmRTenJsRWhSSWhyRTl2UmVoRk1ZaE9NanpSbVlhMnBFQ3k4VmhkZklQM2IzL1p6cGdwRWRLNS8rcWJ4ejBaRWxrbE1Xd1NuREE9PQo=";
const DATA = Buffer.from("houston updater fixture\n");

const editSignatureText = (edit) =>
  Buffer.from(
    edit(Buffer.from(SIGNATURE, "base64").toString("utf8")),
    "utf8",
  ).toString("base64");

describe("verifyUpdaterSignature", () => {
  it("accepts a tauri signer signature from the trusted key", () => {
    const result = verifyUpdaterSignature({
      pubkey: PUBKEY,
      signature: SIGNATURE,
      data: DATA,
    });
    expect(result.keyId).toBe("6a5a016c2fc0dd69");
    expect(result.trustedComment).toBe(
      "timestamp:1791469796\tfile:fixture.txt",
    );
  });

  it("tolerates the trailing newline a .sig file read from disk carries", () => {
    expect(() =>
      verifyUpdaterSignature({
        pubkey: PUBKEY,
        signature: `${SIGNATURE}\n`,
        data: DATA,
      }),
    ).not.toThrow();
  });

  it("rejects different bytes", () => {
    expect(() =>
      verifyUpdaterSignature({
        pubkey: PUBKEY,
        signature: SIGNATURE,
        data: Buffer.from("houston updater fixture?\n"),
      }),
    ).toThrow("signature does not match the file");
  });

  it("rejects a signature from another key", () => {
    expect(() =>
      verifyUpdaterSignature({
        pubkey: OTHER_PUBKEY,
        signature: SIGNATURE,
        data: DATA,
      }),
    ).toThrow(/^signed by key 6a5a016c2fc0dd69, expected /);
  });

  it("rejects an edited trusted comment", () => {
    const signature = editSignatureText((text) =>
      text.replace("file:fixture.txt", "file:other.txt"),
    );
    expect(() =>
      verifyUpdaterSignature({ pubkey: PUBKEY, signature, data: DATA }),
    ).toThrow("trusted comment signature is invalid");
  });

  it("rejects input that is not a minisign signature", () => {
    expect(() =>
      verifyUpdaterSignature({
        pubkey: PUBKEY,
        signature: Buffer.from("nope").toString("base64"),
        data: DATA,
      }),
    ).toThrow("signature is not a minisign file");
  });
});
