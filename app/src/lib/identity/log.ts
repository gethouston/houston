export type IdentityLogLevel = "error" | "warn" | "info" | "debug";
export type IdentityLogSink = (
  level: IdentityLogLevel,
  message: string,
  context?: string,
) => void;

let sink: IdentityLogSink | null = null;

export function setIdentityLogSink(next: IdentityLogSink | null): void {
  sink = next;
}

export function identityLog(
  level: IdentityLogLevel,
  message: string,
  context = "identity",
): void {
  if (sink) {
    sink(level, message, context);
    return;
  }
  const line = `[${context}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
