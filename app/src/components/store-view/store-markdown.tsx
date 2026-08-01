import { MessageResponse } from "@houston-ai/chat";

export function StoreMarkdown({ children }: { children: string }) {
  return (
    <MessageResponse className="text-[15px] leading-relaxed text-ink/90">
      {children}
    </MessageResponse>
  );
}
