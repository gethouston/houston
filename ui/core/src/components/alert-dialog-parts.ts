/**
 * What the alert dialog adds ON TOP of the shared dialog frame
 * (`dialog-frame.ts`): the two widths a confirm may wear, and where its parts
 * sit at each. Split from the component file to keep that file inside the
 * 200-line rule; not re-exported from the package index — a confirm is built
 * with `ConfirmDialog`, not assembled out of classes.
 *
 * Nothing here touches radius, border, shadow, padding, gap or type. Those are
 * the frame's, and the frame is the same object in every dialog.
 *
 * Breakpoints: `sm:` on the WIDTH only (the one sanctioned exception,
 * DESIGN.md §3.8 — DialogContent's unprefixed cap is the phone gutter); every
 * layout that changes with room does it at `md:`, the product's single edge.
 */

/**
 * The size. `sm` is the narrow confirm and stays narrow on a phone too;
 * `default` takes the frame's own cap.
 */
export const ALERT_DIALOG_CONTENT_CLASS =
  "group/alert-dialog-content data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg";

/**
 * A grid rather than the frame's plain column: on the desktop layer the media
 * slot sits BESIDE the title, which needs real tracks. The narrow `sm` confirm
 * stays centred at every width; the frame's own `md:text-left` is the default
 * size's alignment.
 */
export const ALERT_DIALOG_HEADER_CLASS =
  "grid grid-rows-[auto_1fr] place-items-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 md:group-data-[size=sm]/alert-dialog-content:text-center md:group-data-[size=default]/alert-dialog-content:place-items-start md:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]";

/** The narrow confirm splits its two buttons down the middle instead. */
export const ALERT_DIALOG_FOOTER_CLASS =
  "group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2";

/** Beside the media slot, the title takes the second column. */
export const ALERT_DIALOG_TITLE_CLASS =
  "md:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2";

/** The icon over (or beside) the title: a 64px chip carrying a 32px glyph. */
export const ALERT_DIALOG_MEDIA_CLASS =
  "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-chip-subtle md:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8";
