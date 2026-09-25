import { employeeMetal } from "@houston/design-tokens";

/** Mixes `amount` (0 to 1) of `color` into `base`. The CSS form paints; a
 *  numeric form lets tests measure the exact same recipe. */
export type EmployeeMetalMix = (
  color: string,
  amount: number,
  base: string,
) => string;

export const cssColorMix: EmployeeMetalMix = (color, amount, base) =>
  `color-mix(in srgb, ${color} ${amount * 100}%, ${base})`;

export const EMPLOYEE_METAL_LIGHT = "var(--ht-employee-metal-light)";
export const EMPLOYEE_METAL_SHADE = "var(--ht-employee-metal-shade)";

/**
 * The AI Employee metal: one recipe for the badge header and every avatar
 * disc, so the two can never drift. The surface mixes the employee's colour
 * into the shade, the relief (the helmet) mixes it into the light.
 */
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

/** The avatar disc's paint: the badge surface as a 135deg gradient, the helmet
 *  in relief, and a faint light edge along the top (an inset line, never a
 *  drop shadow, so it holds in dark mode). */
export function employeeAvatarPaint(paint: string) {
  const metal = employeeMetalColors(paint);
  return {
    background: `linear-gradient(135deg, ${metal.top}, ${metal.bottom})`,
    boxShadow: `inset 0 1px 0 ${cssColorMix(EMPLOYEE_METAL_LIGHT, employeeMetal.highlight, "transparent")}`,
    helmet: metal.relief,
  };
}
