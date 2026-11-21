export type EmployeeCardLayout = "grid" | "solo";

export type EmployeeCardStatus = "draft" | "joining" | "hired" | "failed";

export type EmployeeStatusMark = null | "spinner" | "successDot" | "alert";

export interface EmployeeStatusView {
  mark: EmployeeStatusMark;
  dimPortrait: boolean;
  offersActions: boolean;
}

const STATUS_VIEWS: Record<EmployeeCardStatus, EmployeeStatusView> = {
  draft: { mark: null, dimPortrait: false, offersActions: false },
  joining: { mark: "spinner", dimPortrait: true, offersActions: false },
  hired: { mark: "successDot", dimPortrait: false, offersActions: false },
  failed: { mark: "alert", dimPortrait: false, offersActions: true },
};

export function employeeStatusView(
  status: EmployeeCardStatus,
): EmployeeStatusView {
  return STATUS_VIEWS[status];
}

export function paletteColumns(tops: readonly number[]): number {
  const row = tops.findIndex((top) => top !== tops[0]);
  return row === -1 ? tops.length : row;
}

export function paletteKeyStep(
  key: string,
  index: number,
  count: number,
  columns: number,
): number | null {
  const wrap = (next: number) => (next + count) % count;
  switch (key) {
    case "ArrowRight":
      return wrap(index + 1);
    case "ArrowLeft":
      return wrap(index - 1);
    case "ArrowDown":
      return wrap(index + columns);
    case "ArrowUp":
      return wrap(index - columns);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
