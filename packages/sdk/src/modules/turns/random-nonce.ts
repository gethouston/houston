export function randomNonce(): string {
  const c: Partial<Crypto> | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;
  try {
    if (typeof c?.randomUUID === "function") return c.randomUUID();
  } catch {}
  try {
    if (typeof c?.getRandomValues === "function") {
      const bytes = c.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  return (
    Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
  );
}
