/**
 * The dialog frame — the ONE modal surface in the product.
 *
 * Every dialog wears this: the plain `Dialog`, the `AlertDialog` behind a
 * confirm, and every recipe built on either (FormDialog, FlowSheet, the
 * catalog detail). Radius, border, shadow, padding, the gaps between the
 * stacked parts and the type of the title and its line of consequence are all
 * spelled once, here, so a confirm, a form and a step of a flow are visibly
 * the same object with different contents. The delete confirm is where these
 * values come from — it is the dialog that reads as finished.
 *
 * What a caller still owns is the WIDTH (`sm:max-w-*`, always `sm:` — the
 * unprefixed `max-w-[calc(100%-2rem)]` below is the phone gutter) and, for a
 * surface whose own parts pay the padding, `p-0`. A cap at or above the `sm`
 * edge (40rem) is written `sm:max-w-[min(<cap>,calc(100%-2rem))]`: a plain
 * `sm:max-w-2xl` replaces the gutter with a 42rem cap the viewport cannot yet
 * pay for, and the dialog runs edge to edge until it can. Anything else
 * overridden at a call site is a dialog drifting away from the frame again.
 *
 * Width is also the ONE place `sm:` is legal here (DESIGN.md §3.8). Every
 * other breakpoint below is `md:`, the product's single 768px edge: unprefixed
 * is the phone layout, `md:` is the desktop one.
 */

/**
 * The scrim.
 *
 * `black/25`, one weight under every dialog. A modal already separates itself
 * with a solid surface, its own radius and the depth below — the scrim only
 * has to say "the page behind is not the subject", and a heavier wash turns
 * the aurora canvas into mud in dark mode while adding nothing in light.
 */
export const DIALOG_OVERLAY_CLASS =
  "fixed inset-0 z-50 bg-black/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0";

/**
 * The surface itself.
 *
 * `rounded-2xl` is the `xxl` radius the tokens give large cards and dialogs;
 * `border-line/50` is the hairline that keeps the surface's edge readable
 * where its depth falls off.
 *
 * Depth is `.ht-shadow-dialog` (`canvas.css`, the sanctioned effects layer),
 * which splits light from dark rather than tinting one shadow twice: light
 * seats the surface on a near-ink 1px edge, dark trades that for a 10% white
 * ring so the frame never reads as a drop shadow laid over the aurora.
 *
 * `grid-cols-[minmax(0,1fr)]`, not a bare `grid`: an implicit auto track
 * refuses to shrink below its content's min-content width, so ONE nowrap child
 * (a truncating title, a long unbroken word, a wide table) silently pushed the
 * whole surface past its max-width (PRODUCT-1231). `minmax(0,…)` lets children
 * clip or scroll instead.
 *
 * `bg-dialog` is SOLID in both themes (white in light, neutral.800 in dark) —
 * a modal sits over arbitrary content and must never bleed it. Not `bg-card`,
 * which is glass in both.
 */
export const DIALOG_CONTENT_CLASS =
  "ht-shadow-dialog fixed top-[50%] left-[50%] z-50 grid grid-cols-[minmax(0,1fr)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-line/50 bg-dialog p-6 duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

/**
 * The header's rhythm and alignment, without a layout of its own: the alert
 * dialog's header is a grid (its media slot sits beside the title), so it
 * takes these and brings its own tracks.
 */
export const DIALOG_HEADER_FRAME_CLASS = "gap-1.5 text-center md:text-left";

/** The header: the title over its line of consequence, tight. */
export const DIALOG_HEADER_CLASS = `flex flex-col ${DIALOG_HEADER_FRAME_CLASS}`;

/** The title. */
export const DIALOG_TITLE_CLASS = "text-lg font-semibold";

/** The one line under it: what happens, in the user's words. */
export const DIALOG_DESCRIPTION_CLASS = "text-sm text-ink-muted";

/**
 * The close X. ONE control, whether it floats in the dialog's corner or sits
 * in a header row (the wide flow sheet, the AI Hub detail): `rounded-lg` is
 * the `lg` radius the tokens give icon buttons, and the hover plate is the
 * same quiet one on both. Two dialogs with two shapes of X read as two
 * components. Keyboard focus wears the Button's ring: this is often the
 * only control a keyboard user can reach to leave the surface.
 */
export const DIALOG_CLOSE_CLASS =
  "shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors duration-200 outline-none hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** Where the dialog's own X floats: the top-right corner, inside the padding. */
export const DIALOG_CLOSE_CORNER_CLASS = "absolute top-4 right-4";

/**
 * The actions. Stacked bottom-up on a phone (the primary nearest the thumb),
 * one right-aligned row from the desktop breakpoint on.
 */
export const DIALOG_FOOTER_CLASS =
  "flex flex-col-reverse gap-2 md:flex-row md:justify-end";
