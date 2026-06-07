/**
 * Minimal pre-app splash shown while the lazily-loaded app tree downloads.
 * Self-contained inline styles — globals.css (and its theme tokens) only loads
 * with the app chunk, so this can't rely on Tailwind classes.
 */
export function BootSplash() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0d0d0d",
        color: "#888",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14,
      }}
    >
      Starting Houston…
    </div>
  );
}
