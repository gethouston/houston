const leaf = (token) => token.path.slice(1).join("-");

const inGroup = (tokens, group) => tokens.filter((t) => t.path[0] === group);

export function colors(tokens) {
  return inGroup(tokens, "ht").map((t) => ({ name: leaf(t), value: t.value }));
}

export function scale(tokens, group) {
  return inGroup(tokens, group).map((t) => ({ name: leaf(t), value: t.value }));
}

export function font(tokens, kind) {
  return tokens
    .filter((t) => t.path[0] === "font" && t.path[1] === kind)
    .map((t) => ({ name: t.path[2], value: t.value }));
}

export function easings(tokens) {
  return inGroup(tokens, "easing").map((t) => ({
    name: leaf(t),
    value: t.value,
  }));
}

export function shadows(tokens) {
  return inGroup(tokens, "shadow").map((t) => ({
    name: leaf(t),
    layers: Array.isArray(t.value) ? t.value : [t.value],
  }));
}

export function durationMs(value) {
  const ms = value.match(/^([\d.]+)ms$/);
  if (ms) return Number.parseFloat(ms[1]);
  const s = value.match(/^([\d.]+)s$/);
  if (s) return Number.parseFloat(s[1]) * 1000;
  throw new Error(`Unparseable duration: ${value}`);
}

export function px(value) {
  const m = value.match(/^(-?[\d.]+)px$/);
  if (!m) throw new Error(`Unparseable dimension: ${value}`);
  return Number.parseFloat(m[1]);
}

export function shadowLayerCss(layer) {
  const geometry = `${layer.offsetX} ${layer.offsetY} ${layer.blur} ${layer.spread} ${layer.color}`;
  return `${layer.inset ? "inset " : ""}${geometry}`
    .replace(/\s+/g, " ")
    .trim();
}
