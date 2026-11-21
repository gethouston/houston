export function formatHostListeningBanner(args: {
  port: number;
  token: string;
  redactToken: boolean;
}): string {
  const base = `HOUSTON_HOST_LISTENING port=${args.port}`;
  if (!args.redactToken) return `${base} token=${args.token}`;
  return `${base} token_fp=${tokenFingerprint(args.token)} token_len=${args.token.length}`;
}

function tokenFingerprint(token: string): string {
  return token.slice(0, 8);
}
