export { FsVfs } from "./fs";
export { MemoryVfs } from "./memory";
export { assertSafeKey, type ObjectStat, type Vfs } from "./vfs";
// GcsVfs (the cloud adapter) lives in `@houston/host-cloud` (vfs/gcs.ts); the
// cloud wiring point imports it from there, never through this open barrel.
