import { conversations } from "./conversation-cache";

const heldTurns = new Map<string, number>();
const commandsInFlight = new Set<string>();

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export function holdConversationTurn(id: string, turn: Promise<void>): void {
  heldTurns.set(id, (heldTurns.get(id) ?? 0) + 1);
  const release = () => {
    const held = (heldTurns.get(id) ?? 1) - 1;
    held > 0 ? heldTurns.set(id, held) : heldTurns.delete(id);
  };
  turn.then(release, (err) => {
    release();
    console.warn(
      `[conversation-command] turn for ${id} rejected instead of settling:`,
      errMessage(err),
    );
  });
}

export function beginConversationCommand(id: string): () => void {
  commandsInFlight.add(id);
  return () => commandsInFlight.delete(id);
}

export function conversationCommandInFlight(id: string): boolean {
  return commandsInFlight.has(id);
}

export function conversationCommandBusy(id: string): boolean {
  return (
    commandsInFlight.has(id) ||
    heldTurns.has(id) ||
    (conversations.get(id)?.pending ?? 0) > 0
  );
}
