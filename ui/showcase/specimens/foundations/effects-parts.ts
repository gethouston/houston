export interface AuroraStop {
  where: string;
  tone: string;
  color: string;
  shape: string;
}

export const AURORA_STOPS: readonly AuroraStop[] = [
  {
    where: "Top centre",
    tone: "Blue",
    color: "rgba(59, 130, 246, 0.22)",
    shape: "ellipse 80% 50% at 50% -8%",
  },
  {
    where: "Upper right",
    tone: "Orange",
    color: "rgba(249, 115, 22, 0.11)",
    shape: "ellipse 70% 55% at 88% 16%",
  },
  {
    where: "Lower left",
    tone: "Indigo",
    color: "rgba(129, 140, 248, 0.18)",
    shape: "ellipse 65% 55% at 8% 90%",
  },
  {
    where: "Bottom centre",
    tone: "Blue",
    color: "rgba(59, 130, 246, 0.1)",
    shape: "ellipse 50% 45% at 55% 112%",
  },
];

export const AURORA_BACKGROUND = AURORA_STOPS.map(
  (stop) => `radial-gradient(${stop.shape}, ${stop.color}, transparent)`,
).join(", ");

export interface EffectValue {
  property: string;
  value: string;
  note: string;
}

export const GLASS_VALUES: readonly EffectValue[] = [
  {
    property: "background",
    value: "var(--ht-card)",
    note: "The one part that IS a token: rgba(255,255,255,.68) light, rgba(40,40,40,.5) dark.",
  },
  {
    property: "backdrop-filter",
    value: "blur(14px) saturate(1.3)",
    note: "What turns a faded rectangle into a pane of glass. Also spelled -webkit- for WebView2.",
  },
  {
    property: "box-shadow (light)",
    value: "inset 0 1px 0 rgba(255, 255, 255, 0.45)",
    note: "A 1px top sheen — the lit edge of the pane, not a drop shadow.",
  },
  {
    property: "box-shadow (dark)",
    value: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
    note: "The same sheen, dialled almost out: dark glass barely catches the light.",
  },
];

export const EFFECT_DISCLAIMER =
  "Effect, not a token — lives in ui/core/src/canvas.css; does not switch with a palette change.";
