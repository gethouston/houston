import { useRef } from "react";

export function useStableByContent<T>(value: T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  const key = JSON.stringify(value);
  if (ref.current === null || ref.current.key !== key)
    ref.current = { key, value };
  return ref.current.value;
}
