/**
 * Gate for the composer's unified send (AIBoard `handleSend`).
 *
 * A double-fired submit — Enter key auto-repeat, a second Enter before React
 * re-renders, a double click — arrives while the first send is still in
 * flight. With no active session key yet, BOTH invocations take the
 * create-conversation branch and mint two missions from one message: the user
 * pays for two turns and the board ends up with a shadow duplicate. Drop the
 * repeat. Sends into an existing session are never dropped — the send queue
 * already serializes those.
 */
export function shouldDropComposerSend(args: {
  activeSessionKey: string | null;
  sendInFlight: boolean;
}): boolean {
  return args.sendInFlight && !args.activeSessionKey;
}
