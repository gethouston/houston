const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WEB_VISITOR_PARAM = "hv";

export const WEB_VISITOR_KEY = "houston.web_visitor_id";

export interface WebVisitorPorts {
  href: string;
  clean(url: string): void;
  readStored(): string | null;
  writeStored(id: string): void;
}

export function webVisitorParam(search: string): string | null {
  const values = new URLSearchParams(search).getAll(WEB_VISITOR_PARAM);
  if (values.length !== 1) return null;
  const value = values[0].trim().toLowerCase();
  return UUID_V4.test(value) ? value : null;
}

export function withoutWebVisitorParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(WEB_VISITOR_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function captureWebVisitorId(ports: WebVisitorPorts): string | null {
  const url = new URL(ports.href);
  const present = url.searchParams.has(WEB_VISITOR_PARAM);
  const fresh = present ? webVisitorParam(url.search) : null;
  if (present) ports.clean(withoutWebVisitorParam(ports.href));
  if (!fresh) {
    const stored = ports.readStored();
    return stored !== null && UUID_V4.test(stored) ? stored : null;
  }
  ports.writeStored(fresh);
  return fresh;
}

function browserPorts(): WebVisitorPorts {
  return {
    href: window.location.href,
    clean: (url) => window.history.replaceState(window.history.state, "", url),
    readStored: () => {
      try {
        return window.sessionStorage.getItem(WEB_VISITOR_KEY);
      } catch {
        return null;
      }
    },
    writeStored: (id) => {
      try {
        window.sessionStorage.setItem(WEB_VISITOR_KEY, id);
      } catch {}
    },
  };
}

let captured: string | null = null;
let capturedOnce = false;

export function readWebVisitorId(): string | null {
  if (capturedOnce) return captured;
  capturedOnce = true;
  captured = captureWebVisitorId(browserPorts());
  return captured;
}
