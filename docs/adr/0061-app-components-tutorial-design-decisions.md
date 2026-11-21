# app/src/components/tutorial: design decisions

Covers `app/src/components/tutorial/`: the content-agnostic tutorial primitives: spotlight veil, geometry, measuring and lesson card. File paths in this record are relative to that folder.

## Content-agnostic primitives

The tutorial family (spotlight veil, its geometry and measuring, the lesson video card, the dismiss button) knows nothing about which lesson runs. Lessons supply copy, branding and the step machine; every string arrives translated.

Lives in `app/src/components/tutorial/index.ts`.

## Video card: watching is never a gate

Continue is enabled from the first frame; finishing the video only promotes the button from outline to filled. A missing source and a media error both land on the same calm placeholder. State resets via the `key` pattern, not an effect. Focus starts on the player (by hand, since React honours `autoFocus` only on form controls) so Space plays it; if the player fails and unmounts, focus moves to Continue so it does not fall to the app behind the panel. No empty `<track>` is rendered, since that would advertise captions that do not exist. Preload is metadata only. The 16:9 plate is capped by width so on a short window the video shrinks rather than pushing Continue off screen.

Lives in `lesson-video-card.tsx`.

## Spotlight geometry

The card goes beside the target (right, left, below, above), beside the whole modal for in-dialog steps first, and only then centered. Transparent panels around the hole swallow pointer events because a box-shadow is not hit-testable. Every panel size is clamped at zero: a target flush with the viewport edge yields a negative size, which the browser drops as invalid CSS, leaving the panel at its previous size and walling off the control.

Lives in `tutorial-spotlight-geometry.ts`.

## Veil animation on the fixed elements

Fade-in is applied to each fixed veil element, never to a wrapper: an ancestor mid-animation becomes the containing block for fixed children and moves the hole off target. In-dialog steps cut around the whole modal and ring the inner target.

Lives in `tutorial-spotlight-veil.tsx`.

## Measuring targets

The target is the first visible match, since some anchors exist twice (a desktop control CSS-hidden on phones beside the phone's own). Bounds are polled and re-measured on resize because targets appear and move at any time; an equality guard keeps a settled step render-free. The dialog box is found via Radix `data-state`, which excludes the lesson's own bare dialog.

Lives in `use-spotlight-rects.ts`.

## Dismiss rides its own card

The close button is part of the surface it closes, not a fixed window corner: the surface moves, and a detached chip falls outside the card's `aria-modal` scope where screen readers cannot reach it.

Lives in `tutorial-dismiss-button.tsx`.
