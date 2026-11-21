export function SystemNote({ text }: { text: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="text-xs text-ink-muted/60 italic">{text}</span>
    </div>
  );
}
