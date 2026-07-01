import { createRoot, type Root } from "react-dom/client";

/**
 * A React root container that remembers the {@link Root} we mounted into it.
 *
 * React keys its root bookkeeping off the container node, so handing the same
 * container to {@link createRoot} a second time spins up a *competing* root.
 * The two roots then both try to own the container's children and desync during
 * the commit phase, which surfaces as
 * `Failed to execute 'removeChild' on 'Node': The node to be removed is not a
 * child of this node` (HOU-459).
 */
type RootContainer = (Element | DocumentFragment) & { __houstonRoot?: Root };

/**
 * Idempotently obtain the React root for `container`.
 *
 * The first call mounts a root and caches it on the node; every later call
 * returns that same root so the caller re-renders through `root.render(...)`
 * instead of minting a second root. In production the entry module runs exactly
 * once, so this is a plain `createRoot`. In dev, Vite / React Fast Refresh can
 * re-evaluate the entry module against the still-live document; without this
 * guard that re-evaluation calls `createRoot` twice on `#root` and crashes the
 * app with a `removeChild` reconciliation error (HOU-459).
 *
 * `create` is injectable purely so the guard can be unit-tested without a DOM.
 */
export function getOrCreateRoot(
  container: RootContainer,
  create: (node: Element | DocumentFragment) => Root = createRoot,
): Root {
  return (container.__houstonRoot ??= create(container));
}
