/**
 * A plain centered system note, identical to the default row `ui/chat` renders
 * for a `system_message`. Exists so the app can substitute TRANSLATED copy for
 * a line the SDK authored in English without the row changing appearance:
 * `renderSystemMessage` must return an element (returning `undefined` would
 * fall through to the English text).
 */
export function SystemNote({ text }: { text: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="text-xs text-ink-muted/60 italic">{text}</span>
    </div>
  );
}
