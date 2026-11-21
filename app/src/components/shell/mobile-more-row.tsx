import { sidebarSheetRowClasses } from "@houston-ai/layout";
import { ChevronRight } from "lucide-react";
import type { ReactNode, Ref } from "react";
import type { MenuRow } from "./menu-row";

function RowFace(props: { icon: ReactNode; label: string }) {
  return (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center text-ink-muted">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
    </>
  );
}

export function MobileMoreRowButton({ row }: { row: MenuRow }) {
  return (
    <button
      type="button"
      onClick={row.onClick}
      className={sidebarSheetRowClasses}
      {...row.dataAttrs}
    >
      <RowFace icon={row.icon} label={row.label} />
    </button>
  );
}

export function MobileAccountRow(props: {
  label: string;
  avatar: ReactNode;
  onOpen: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={props.ref}
      type="button"
      data-testid="more-account"
      onClick={props.onOpen}
      className={sidebarSheetRowClasses}
    >
      <RowFace icon={props.avatar} label={props.label} />
      <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
    </button>
  );
}
