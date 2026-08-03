/**
 * Minimal element factory for satori.
 *
 * satori renders plain `{ type, props }` objects — the same shape JSX compiles
 * to — so the certificate templates are written with this helper instead of
 * JSX. The site has no bundler and no JSX toolchain, and we are not adding one
 * for two build-time images.
 *
 * Note: satori implements a subset of flexbox and has NO block layout, so every
 * node with more than one child must set `display: "flex"` and an explicit
 * `flexDirection`.
 */
const h = (type, props, ...kids) => ({
  type,
  props: { ...props, children: kids.length === 1 ? kids[0] : kids.flat() },
});

export default h;
