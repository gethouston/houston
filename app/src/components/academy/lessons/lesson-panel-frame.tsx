import type { ReactNode } from "react";

export function LessonPanelFrame({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-medium text-balance text-ink">{title}</h2>
        <p className="mt-1 text-sm text-balance text-ink-muted">{body}</p>
      </div>
      {children}
    </div>
  );
}
