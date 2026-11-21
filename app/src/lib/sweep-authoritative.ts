export function sweepIsAuthoritative(query: {
  isSuccess: boolean;
  isPlaceholderData: boolean;
}): boolean {
  return query.isSuccess && !query.isPlaceholderData;
}
