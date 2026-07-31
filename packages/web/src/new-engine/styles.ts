import type { CSSProperties } from "react";

/**
 * Inline styles for the new-engine surface. Like the Connect screen, this UI
 * renders in the entry chunk (before any Tailwind/app CSS loads), so it must
 * carry its own styles. The full-page gate surfaces (page/muted/error) follow
 * the cached theme index.html stamped on <html> before paint, so the boot
 * sequence holds one surface per theme instead of flashing dark at light
 * users; values mirror the sanctioned pre-boot frame colors (light screen
 * `#fcfcfc`, dark gutter `#141416`). The Connect card and the dev shell stay
 * deliberately dark, self-contained panels.
 */
const isDark =
  typeof document !== "undefined" &&
  document.documentElement.getAttribute("data-theme") === "dark";

const pageBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  fontFamily: "system-ui, -apple-system, sans-serif",
  padding: 24,
};

export const ui: Record<string, CSSProperties> = {
  page: {
    ...pageBase,
    background: isDark ? "#141416" : "#fcfcfc",
    color: isDark ? "#e5e5e5" : "#14161d",
  },
  // The Connect screen: a deliberately dark, self-contained surface in BOTH
  // themes (its card/inputs/labels are dark-designed) — the inline-style
  // equivalent of DESIGN.md's pin-dark-subtree rule.
  pageDark: {
    ...pageBase,
    background: "#141416",
    color: "#f5f5f5",
  },
  muted: {
    color: isDark ? "#9a9a9a" : "#8e8e8e",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 1.6,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    maxWidth: 380,
    padding: 32,
    borderRadius: 16,
    background: "#161616",
    color: "#f5f5f5",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  brand: { fontSize: 22, fontWeight: 600 },
  subtitle: { margin: "0 0 6px", fontSize: 14, color: "#9a9a9a" },
  // Action button on a dark surface (the Connect card): mirrors the app's
  // dark-theme `action` fill.
  button: {
    height: 42,
    borderRadius: 10,
    border: "none",
    background: "#f5f5f5",
    color: "#0d0d0d",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  // Action button on the THEMED gate page: the app's `action` fill per theme.
  pageButton: {
    height: 42,
    borderRadius: 10,
    border: "none",
    background: isDark ? "#e5e5e5" : "#0d0d0d",
    color: isDark ? "#171717" : "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    padding: "0 18px",
  },
  note: { margin: 0, fontSize: 12.5, color: "#bdbdbd", lineHeight: 1.5 },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: "#bdbdbd",
  },
  input: {
    height: 40,
    padding: "0 12px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d0d0d",
    color: "#f5f5f5",
    fontSize: 14,
    outline: "none",
  },
  // Renders only inside the dark Connect card — dark-surface red, both themes.
  error: { margin: 0, fontSize: 13, color: "#ff6b6b" },

  shell: {
    display: "flex",
    height: "100vh",
    background: "#0d0d0d",
    color: "#f5f5f5",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  sidebar: {
    width: 260,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    overflowY: "auto",
  },
  newChat: {
    height: 38,
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "#f5f5f5",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 4,
  },
  convItem: {
    textAlign: "left",
    border: "none",
    background: "transparent",
    color: "#cfcfcf",
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
  },
  convActive: { background: "rgba(122,92,255,0.18)", color: "#fff" },
  convTitle: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  convLast: {
    fontSize: 11,
    opacity: 0.6,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  log: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  userMsg: {
    alignSelf: "flex-end",
    maxWidth: "78%",
    background: "#7a5cff",
    color: "#fff",
    padding: "9px 13px",
    borderRadius: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  asstMsg: {
    alignSelf: "flex-start",
    maxWidth: "78%",
    background: "#1c1c1c",
    color: "#f0f0f0",
    padding: "9px 13px",
    borderRadius: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  composer: {
    display: "flex",
    gap: 8,
    padding: 14,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  composerInput: {
    flex: 1,
    height: 42,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d0d0d",
    color: "#f5f5f5",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    height: 42,
    padding: "0 18px",
    borderRadius: 10,
    border: "none",
    background: "#f5f5f5",
    color: "#0d0d0d",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
