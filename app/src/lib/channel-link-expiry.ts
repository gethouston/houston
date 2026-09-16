/** Device sleep and delayed browser timers must not leave a stale code usable. */
export function channelLinkExpired(
  expiresAt: string,
  now = Date.now(),
): boolean {
  const expires = Date.parse(expiresAt);
  return !Number.isFinite(expires) || now >= expires;
}
