import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import { cn } from "../utils";

export interface Toast {
  id: string;
  message: string;
  variant: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const Icon =
    toast.variant === "success"
      ? CheckCircle
      : toast.variant === "error"
        ? AlertCircle
        : Info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg bg-card",
        toast.variant === "error" && "border-destructive/30",
        toast.variant === "success" && "border-success/30",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 mt-0.5 shrink-0",
          toast.variant === "success" && "text-success",
          toast.variant === "error" && "text-destructive",
          toast.variant === "info" && "text-primary",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="mt-1.5 rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium text-foreground hover:bg-foreground/20 transition-colors"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}
