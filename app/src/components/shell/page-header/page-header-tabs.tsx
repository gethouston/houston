import type { ReactNode } from "react";
import { headerLozengeClasses, headerLozengeTrack } from "./header-lozenge";

export interface PageHeaderTabItem<Id extends string> {
  id: Id;
  label: ReactNode;
  heading?: boolean;
  dataAttrs?: Record<string, string>;
}

/**
 * Header navigation uses `aria-current`, not tab-panel semantics: these items
 * swap a whole page surface. One heading lozenge carries the screen's h1.
 */
export function PageHeaderTabs<Id extends string>({
  items,
  active,
  label,
  onSelect,
}: {
  items: PageHeaderTabItem<Id>[];
  active: Id;
  label: string;
  onSelect: (id: Id) => void;
}) {
  return (
    <nav aria-label={label} className={headerLozengeTrack()}>
      {items.map((item) => {
        const current = item.id === active;
        const button = (
          <button
            key={item.id}
            type="button"
            {...item.dataAttrs}
            aria-current={current ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            className={headerLozengeClasses(current)}
          >
            {item.label}
          </button>
        );
        return item.heading ? (
          // A real flex box keeps the heading in both the layout and the
          // accessibility tree, unlike `display: contents`.
          <h1 key={item.id} className="flex min-w-0">
            {button}
          </h1>
        ) : (
          <span key={item.id} className="flex">
            {button}
          </span>
        );
      })}
    </nav>
  );
}
