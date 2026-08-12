import type { ReactNode } from "react";
import { PageHeader } from "./page-header";
import { PageHeaderBackChip } from "./page-header-back-chip";
import { headerCollapsesTabs } from "./page-header-layout";
import { PageHeaderSwitcher } from "./page-header-switcher";
import { PageHeaderTabs } from "./page-header-tabs";
import { usePageHeaderMode } from "./page-header-tools";

export interface DrilledHeaderItem<Id extends string> {
  id: Id;
  label: string;
  heading?: boolean;
  dataAttrs?: Record<string, string>;
}

/** Shared second-level chrome: identity back chip plus section lozenges. */
export function DrilledHeader<Id extends string>(props: {
  backLabel: string;
  backIcon: ReactNode;
  backDataAttrs?: Record<string, string>;
  items: DrilledHeaderItem<Id>[];
  active: Id;
  label: string;
  switcherDataAttrs?: Record<string, string>;
  tools?: ReactNode;
  onSelect: (id: Id) => void;
  onBack: () => void;
}) {
  const collapsed = headerCollapsesTabs(usePageHeaderMode());
  const activeLabel = props.items.find(
    (item) => item.id === props.active,
  )?.label;
  return (
    <PageHeader>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PageHeaderBackChip
          label={props.backLabel}
          icon={props.backIcon}
          onClick={props.onBack}
          dataAttrs={props.backDataAttrs}
        />
        {collapsed ? (
          <PageHeaderSwitcher
            identity={<span className="truncate">{activeLabel}</span>}
            items={props.items}
            active={props.active}
            label={props.label}
            onSelect={props.onSelect}
            dataAttrs={props.switcherDataAttrs}
          />
        ) : (
          <PageHeaderTabs
            items={props.items}
            active={props.active}
            label={props.label}
            onSelect={props.onSelect}
          />
        )}
        {props.tools && <div className="ml-auto shrink-0">{props.tools}</div>}
      </div>
    </PageHeader>
  );
}
