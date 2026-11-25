// WHY: Store sync and the Files tab skip exactly this suffix; a plain .tmp would hide user files. ADR-0017
export const ATOMIC_TMP_SUFFIX = ".houston.tmp";

export const isAtomicTemp = (name: string): boolean =>
  name.endsWith(ATOMIC_TMP_SUFFIX);

export const atomicTempPath = (destination: string, unique?: string): string =>
  unique
    ? `${destination}.${unique}${ATOMIC_TMP_SUFFIX}`
    : `${destination}${ATOMIC_TMP_SUFFIX}`;
