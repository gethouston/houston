export const ATOMIC_TMP_SUFFIX = ".houston.tmp";

export const isAtomicTemp = (name: string): boolean =>
  name.endsWith(ATOMIC_TMP_SUFFIX);

export const atomicTempPath = (destination: string, unique?: string): string =>
  unique
    ? `${destination}.${unique}${ATOMIC_TMP_SUFFIX}`
    : `${destination}${ATOMIC_TMP_SUFFIX}`;
