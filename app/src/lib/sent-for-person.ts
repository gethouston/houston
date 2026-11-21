export function isTypedSend(overrides: { sentForPerson?: true }): boolean {
  return overrides.sentForPerson !== true;
}
