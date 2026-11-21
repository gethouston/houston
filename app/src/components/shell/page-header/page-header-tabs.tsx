import type { ReactNode } from "react";
import { headerLozengeClasses, headerLozengeTrack } from "./header-lozenge";

export interface PageHeaderTabItem<Id extends string> {
  id: Id;
  label: ReactNode;
  heading?: boolean;
  dataAttrs?: Record<string, string>;
}

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
  if (items.length === 1) {
    const [item] = items;
    const lozenge = (
      <span {...item.dataAttrs} className={headerLozengeClasses(true)}>
        {item.label}
      </span>
    );
    return (
      <div className={headerLozengeTrack()}>
        {item.heading ? (
          <h1 className="flex min-w-0">{lozenge}</h1>
        ) : (
          <span className="flex">{lozenge}</span>
        )}
      </div>
    );
  }
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
