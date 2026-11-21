export function nextErrorToastState(
  prevReported: unknown,
  isFailure: boolean,
  errorIdentity: unknown,
): { shouldToast: boolean; reported: unknown } {
  if (!isFailure) return { shouldToast: false, reported: null };
  if (prevReported === errorIdentity)
    return { shouldToast: false, reported: errorIdentity };
  return { shouldToast: true, reported: errorIdentity };
}

export const EMPTY_CATALOG_FAILURE = Object.freeze({
  reason: "empty-provider-catalog",
});

export function deriveCatalogFailure(input: {
  isError: boolean;
  error: unknown;
  isSuccess: boolean;
  count: number;
}): { isFailure: boolean; identity: unknown } {
  if (input.isError) return { isFailure: true, identity: input.error };
  if (input.isSuccess && input.count === 0)
    return { isFailure: true, identity: EMPTY_CATALOG_FAILURE };
  return { isFailure: false, identity: null };
}
