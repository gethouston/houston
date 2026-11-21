import type { UISliceCreator } from "./state.ts";
import type { ToastItem } from "./types.ts";

export interface ToastFields {
  toasts: ToastItem[];
}

export interface ToastActions {
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

export const toastInitialState = {
  toasts: [],
} satisfies ToastFields;

let toastCounter = 0;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearToastTimers(): void {
  for (const timer of toastTimers.values()) clearTimeout(timer);
  toastTimers.clear();
}

export const createToastActions: UISliceCreator<ToastActions> = (set) => ({
  addToast: (toast) =>
    set((s) => {
      const timeout = toast.action ? 10000 : 5000;
      const expireAfter = (id: string) => {
        const prevTimer = toastTimers.get(id);
        if (prevTimer) clearTimeout(prevTimer);
        toastTimers.set(
          id,
          setTimeout(() => {
            toastTimers.delete(id);
            set((prev) => ({
              toasts: prev.toasts.filter((t) => t.id !== id),
            }));
          }, timeout),
        );
      };

      const existing = s.toasts.find(
        (t) =>
          t.title === toast.title &&
          t.description === toast.description &&
          (t.variant ?? "info") === (toast.variant ?? "info"),
      );
      if (existing) {
        expireAfter(existing.id);
        return {
          toasts: s.toasts.map((t) =>
            t.id === existing.id ? { ...t, count: (t.count ?? 1) + 1 } : t,
          ),
        };
      }

      const id = `toast-${++toastCounter}`;
      expireAfter(id);
      return { toasts: [...s.toasts, { ...toast, id }] };
    }),

  dismissToast: (id) =>
    set((s) => {
      const timer = toastTimers.get(id);
      if (timer) clearTimeout(timer);
      toastTimers.delete(id);
      return { toasts: s.toasts.filter((t) => t.id !== id) };
    }),
});
