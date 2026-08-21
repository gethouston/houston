export { FsVfs } from "./fs";
// The closed GcsVfs adapter was retired with `@houston/host-cloud` (git
// history); any out-of-repo Vfs adapter binds behind the port, never through
// this open barrel.
export { LazyStoreVfs } from "./lazy-store";
export {
  LazyReadRefusedError,
  type LazyStoreVfsOptions,
  UNREAD_HASH,
} from "./lazy-store-types";
export { MemoryVfs } from "./memory";
export { PrefixedVfs } from "./prefixed";
export { assertSafeKey, decodeText, type ObjectStat, type Vfs } from "./vfs";
