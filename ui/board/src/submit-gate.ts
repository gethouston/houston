export function shouldDropComposerSend(args: {
  activeSessionKey: string | null;
  sendInFlight: boolean;
}): boolean {
  return args.sendInFlight && !args.activeSessionKey;
}
