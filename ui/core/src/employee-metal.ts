import { employeeMetal } from "@houston/design-tokens";

export type EmployeeMetalMix = (
  color: string,
  amount: number,
  base: string,
) => string;

export const cssColorMix: EmployeeMetalMix = (color, amount, base) =>
  `color-mix(in srgb, ${color} ${amount * 100}%, ${base})`;

function hexChannels(hex: string): [number, number, number] {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex))
    throw new Error(`hexColorMix takes opaque #rgb or #rrggbb, got "${hex}"`);
  let digits = hex.slice(1);
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

export const hexColorMix: EmployeeMetalMix = (color, amount, base) => {
  const a = hexChannels(color);
  const b = hexChannels(base);
  return `#${a
    .map((c, i) =>
      Math.round(c * amount + b[i] * (1 - amount))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

export const EMPLOYEE_METAL_LIGHT = "var(--ht-employee-metal-light)";
export const EMPLOYEE_METAL_SHADE = "var(--ht-employee-metal-shade)";

export function employeeMetalColors(
  paint: string,
  light = EMPLOYEE_METAL_LIGHT,
  shade = EMPLOYEE_METAL_SHADE,
  mix: EmployeeMetalMix = cssColorMix,
) {
  const top = mix(paint, employeeMetal.top, shade);
  const bottom = mix(paint, employeeMetal.bottom, shade);
  const relief = mix(paint, employeeMetal.relief, light);
  return {
    top,
    bottom,
    relief,
    sheen: mix(relief, employeeMetal.sheen, top),
    engraving: mix(relief, employeeMetal.engraving, top),
    control: mix(relief, employeeMetal.control, bottom),
  };
}

export function employeeAvatarPaint(paint: string) {
  const metal = employeeMetalColors(paint);
  return {
    background: `linear-gradient(135deg, ${metal.top}, ${metal.bottom})`,
    boxShadow: `inset 0 1px 0 ${cssColorMix(EMPLOYEE_METAL_LIGHT, employeeMetal.highlight, "transparent")}`,
    helmet: metal.relief,
  };
}
