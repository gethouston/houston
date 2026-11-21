export type StatusKind = "active" | "pending" | "error";

export const STATUS_DOT_CLASS: Record<StatusKind, string> = {
  active: "bg-success",
  pending: "bg-warning",
  error: "bg-danger",
};

export const STATUS_TEXT_CLASS: Record<StatusKind, string> = {
  active: "text-success-ink",
  pending: "text-warning-ink",
  error: "text-danger-ink",
};
