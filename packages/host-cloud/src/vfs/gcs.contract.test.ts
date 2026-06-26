import { test } from "bun:test";
import {
  prefixed,
  runVfsContract,
} from "@houston/host/src/testing/vfs-contract";
import { GcsVfs } from "./gcs";

/**
 * GcsVfs (CLOSED) run through the SAME Vfs contract the open Memory/Fs adapters
 * pass (runVfsContract is exported from `@houston/host`), against a REAL object
 * store. The @google-cloud/storage client speaks the JSON API to either a live
 * GCS bucket or a local emulator (fsouza/fake-gcs-server via Testcontainers /
 * docker run) — both external infra, so this run is env-gated on
 * HOUSTON_GCS_TEST_BUCKET rather than always-on. With it set, the EXACT same
 * contract assertions (Memory/Fs already pass) run against the real GcsVfs
 * adapter; otherwise a single explicit skip records the gap with the one-command
 * recipe to close it. It is never faked green. See vfs/README-testing.md.
 *
 * Each contract `make()` needs an isolated namespace inside the shared bucket so
 * cross-prefix assertions hold; we prefix every key with a per-make run id by
 * wrapping the adapter (no adapter change — the prefix lives entirely in the test
 * key space, mirroring the workspace/agent prefixes the contract already uses).
 */
const gcsBucket = process.env.HOUSTON_GCS_TEST_BUCKET;
if (gcsBucket) {
  const endpoint = process.env.HOUSTON_GCS_TEST_ENDPOINT; // e.g. fake-gcs-server
  let runSeq = 0;
  runVfsContract("GcsVfs (live bucket)", () => {
    const { Storage } = require("@google-cloud/storage");
    // An emulator endpoint short-circuits ADC + uses path-style addressing; a
    // real bucket relies on ambient ADC (gcloud auth / a mounted SA key).
    const storage = endpoint
      ? new Storage({ apiEndpoint: endpoint, projectId: "houston-test" })
      : new Storage();
    const base = new GcsVfs(gcsBucket, storage);
    // Namespace each contract instance under a fresh prefix in the shared bucket
    // so independent `make()`s never see each other's objects.
    const ns = `vfs-contract-run-${process.pid}-${runSeq++}`;
    return prefixed(base, ns);
  });
} else {
  test.skip("Vfs contract: GcsVfs (set HOUSTON_GCS_TEST_BUCKET — see vfs/README-testing.md)", () => {});
}
