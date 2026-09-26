// Installs the jsdom globals react-dom needs. Import it BEFORE any dynamic
// `react-dom/client` import: React reads `window`/`document` at module load.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
for (const key of ["Element", "Event", "HTMLElement", "Node"]) {
  g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
