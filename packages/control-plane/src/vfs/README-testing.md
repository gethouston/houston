# Testing `GcsVfs` against a real object store

`vfs/contract.test.ts` runs the shared `runVfsContract` against `MemoryVfs` and
`FsVfs` on every `bun test`. `GcsVfs` talks the GCS JSON API and therefore needs
a **real object store** — a live bucket or a local emulator — so it runs through
the *same* contract only when env-gated. With no bucket configured the suite
emits one explicit `test.skip` (never a fake green).

The gate: set `HOUSTON_GCS_TEST_BUCKET`. Optionally set `HOUSTON_GCS_TEST_ENDPOINT`
to point the client at an emulator instead of real GCS.

## Option A — local emulator (`fsouza/fake-gcs-server`), no GCP account

Needs Docker (not available in every dev sandbox — `docker info` to check).

```sh
# 1. Start the emulator with an empty bucket.
docker run -d --name fake-gcs -p 4443:4443 \
  fsouza/fake-gcs-server -scheme http -public-host localhost:4443

# fake-gcs-server auto-creates buckets on first write when -backend is memory,
# but the contract lists before writing in some cases; create it explicitly:
curl -s -X POST 'http://localhost:4443/storage/v1/b?project=houston-test' \
  -H 'Content-Type: application/json' \
  -d '{"name":"houston-vfs-test"}'

# 2. Run the vfs contract against GcsVfs.
cd packages/control-plane
HOUSTON_GCS_TEST_BUCKET=houston-vfs-test \
HOUSTON_GCS_TEST_ENDPOINT=http://localhost:4443 \
STORAGE_EMULATOR_HOST=http://localhost:4443 \
  bun test src/vfs/contract.test.ts

# 3. Tear down.
docker rm -f fake-gcs
```

The `STORAGE_EMULATOR_HOST` env var makes `@google-cloud/storage` skip ADC auth;
`HOUSTON_GCS_TEST_ENDPOINT` makes the test construct `new Storage({ apiEndpoint })`
so addressing is path-style against the emulator.

## Option B — a real (throwaway) GCS bucket

Needs `gcloud` auth (ADC) with `roles/storage.objectAdmin` on the bucket.

```sh
gcloud auth application-default login
gcloud storage buckets create gs://houston-vfs-test-$USER --location=us

cd packages/control-plane
HOUSTON_GCS_TEST_BUCKET=houston-vfs-test-$USER \
  bun test src/vfs/contract.test.ts

gcloud storage rm --recursive gs://houston-vfs-test-$USER
```

## What it proves

The exact `runVfsContract` assertions `MemoryVfs`/`FsVfs` already pass —
write/read text+bytes, prefix-scoped sorted listing with no cross-prefix leak
(including the `ws/w1` vs `ws/w10` prefix-string trap), `move` (and missing-source
throw), idempotent `deleteKey`, scoped `deletePrefix`, and traversal/absolute-key
rejection — now against the real `GcsVfs` adapter and a real object store. Each
contract instance is namespaced under a fresh `vfs-contract-run-*` prefix inside
the shared bucket so independent instances never see each other's objects.
