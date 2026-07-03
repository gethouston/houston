// Shapes the flat token list from collect() into the groups the serializers
// consume. `leaf` drops the group segment (path[0]); e.g. ["ht","card-fg"] ->
// "card-fg", ["font","size","base"] -> "size-base".

const leaf = (token) => token.path.slice(1).join("-");

const inGroup = (tokens, group) => tokens.filter((t) => t.path[0] === group);

/** Semantic colours: ordered [{ name, value }] for the `ht` group. */
export function colors(tokens) {
  return inGroup(tokens, "ht").map((t) => ({ name: leaf(t), value: t.value }));
}

/** A flat scale group (space, radius, duration): ordered [{ name, value }]. */
export function scale(tokens, group) {
  return inGroup(tokens, group).map((t) => ({ name: leaf(t), value: t.value }));
}

/** Font subgroup (family | weight | size): [{ name, value }] keyed by leaf. */
export function font(tokens, kind) {
  return tokens
    .filter((t) => t.path[0] === "font" && t.path[1] === kind)
    .map((t) => ({ name: t.path[2], value: t.value }));
}

/** Easings: [{ name, value: [x1,y1,x2,y2] }]. */
export function easings(tokens) {
  return inGroup(tokens, "easing").map((t) => ({
    name: leaf(t),
    value: t.value,
  }));
}

/** Shadows: [{ name, layers: ShadowLayer[] }] (single-layer normalized to an array). */
export function shadows(tokens) {
  return inGroup(tokens, "shadow").map((t) => ({
    name: leaf(t),
    layers: Array.isArray(t.value) ? t.value : [t.value],
  }));
}

/** camelCase a hyphenated token name for native identifiers: card-fg -> cardFg. */
export function camel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Parse a DTCG duration ("200ms" | "0.2s") to milliseconds. */
export function durationMs(value) {
  const ms = value.match(/^([\d.]+)ms$/);
  if (ms) return Number.parseFloat(ms[1]);
  const s = value.match(/^([\d.]+)s$/);
  if (s) return Number.parseFloat(s[1]) * 1000;
  throw new Error(`Unparseable duration: ${value}`);
}

/** Parse a DTCG dimension ("16px") to a unitless number. */
export function px(value) {
  const m = value.match(/^(-?[\d.]+)px$/);
  if (!m) throw new Error(`Unparseable dimension: ${value}`);
  return Number.parseFloat(m[1]);
}

/** Render one shadow layer to a CSS box-shadow fragment. */
export function shadowLayerCss(layer) {
  return `${layer.offsetX} ${layer.offsetY} ${layer.blur} ${layer.spread} ${layer.color}`
    .replace(/\s+/g, " ")
    .trim();
}
