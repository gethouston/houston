import type { CSSProperties } from "react";

/** Dashboard palette — matches the cloud-login gate (dark, violet accent). */
export const C = {
  bg: "#0b0b0f",
  panel: "#15151c",
  panel2: "#0e0e13",
  border: "#26262f",
  text: "#e7e7ea",
  dim: "#9a9aa6",
  faint: "#6a6a76",
  accent: "#7a5cff",
  green: "#46d39a",
  amber: "#e0b341",
  red: "#ff7a7a",
  blue: "#5aa9ff",
} as const;

export const page: CSSProperties = {
  minHeight: "100vh",
  background: C.bg,
  color: C.text,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  padding: "24px 28px 64px",
};

export const card: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 18,
};

export const btn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.accent,
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

export const ghostBtn: CSSProperties = {
  ...btn,
  background: "transparent",
  color: C.dim,
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: C.faint,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  padding: "9px 10px",
  fontSize: 13,
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: "middle",
};

/** Status pill colors per agent state. */
export const stateColor: Record<string, string> = {
  running: C.green,
  pending: C.amber,
  asleep: C.blue,
  absent: C.faint,
};

export function pill(color: string): CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color,
    background: `${color}1f`,
    border: `1px solid ${color}55`,
  };
}
