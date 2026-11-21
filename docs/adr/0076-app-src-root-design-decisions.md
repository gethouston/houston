# app/src root files: design decisions

Covers the root files of `app/src/` (`main.tsx`, `App.tsx` and their siblings): boot order, theme and providers. File paths in this record are relative to `app/src/`.

## Theme is applied before first paint

The engine `theme` preference is unreadable until the handshake lands and the boot splash renders during it, so a device mirror paints the theme before React mounts.

Lives in `main.tsx`.

## Engine-backed preferences wait for the handshake

`tauriPreferences` reads through `getEngine()`, which throws until the handshake lands, so install identity, vintage, daily-active date and theme load in `StartupEffects` after it.

Lives in `main.tsx`.

## Long-lived listeners mount above App

The Academy usage accrual and the product analytics pipe must outlive `<App/>`, which remounts on every identity change.

Lives in `main.tsx`, `identity-keyed-app.tsx`.

## App is keyed by identity

Any identity change unmounts and re-bootstraps the subtree, resetting run-once guards and the boot latch.

Lives in `identity-keyed-app.tsx`.

## Boot splash is first-boot only

After the gate clears once, a space switch never re-blanks the shell.

Lives in `App.tsx`.

## Sentry smoke triggers are dev only

Release binaries must not carry them.

Lives in `main.tsx`.
