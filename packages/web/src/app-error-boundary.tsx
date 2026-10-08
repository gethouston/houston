import { analytics, classifyAnalyticsError } from "@houston/app/lib/analytics";
import { showErrorToast } from "@houston/app/lib/error-toast";
import { logger } from "@houston/app/lib/logger";
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    logger.error(`[react-crash] ${error.message}`, error.stack);
    analytics.captureException(error, {
      source: "react_crash",
      error_kind: classifyAnalyticsError(error.message),
    });
    showErrorToast("react_crash", error.message, error);
  }
  render() {
    if (this.state.error) {
      // The app tree imports token CSS before this screen renders, so
      // the --ht-* vars are already in the document when the tree crashes.
      return (
        <div
          data-houston-boot-crashed
          style={{
            position: "fixed",
            inset: 0,
            padding: 32,
            background: "var(--ht-base)",
            color: "var(--ht-ink)",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            overflow: "auto",
            zIndex: 999999,
          }}
        >
          <h1
            style={{
              color: "var(--ht-danger)",
              fontSize: 24,
              margin: 0,
              marginBottom: 16,
            }}
          >
            App crashed
          </h1>
          <p style={{ fontSize: 15, marginBottom: 16, color: "var(--ht-ink)" }}>
            {this.state.error.message}
          </p>
          <pre style={{ fontSize: 12, opacity: 0.85 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
