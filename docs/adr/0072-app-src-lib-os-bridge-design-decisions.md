# app/src/lib/os-bridge: design decisions

Covers `app/src/lib/os-bridge/`: the only Tauri `invoke` site and the native commands behind it. File paths in this record are relative to `app/src/`.

## The only `invoke` site

`app/src/lib/os-bridge/` is the only place in `app/src` that calls `invoke`, narrowed to the declared native surface in `desktop-native-commands.ts`. The barrel exposes the whole bridge because call sites import from it, not from category modules.

Lives in `lib/os-bridge.ts`, `lib/os-bridge/invoke.ts`.

## Loopback listeners are per attempt

Each OAuth loopback listener carries an attempt id; cancel acts only with that id, so a late cancel cannot free a newer attempt. A newer click owning the loopback is a benign outcome. `exactPort` requests report a port held by a foreign process.

Lives in `lib/os-bridge/oauth-loopback.ts`.

## Desktop Claude sign-in runs the bundled CLI

The shell spawns `claude auth login --claudeai`, which opens the browser and catches its own callback. A pasted or clipboard code can finish it; cancel kills the child. The cached credential is extracted only for a remote engine and destroyed (file and keychain item) after the push.

Lives in `lib/os-bridge/oauth-loopback.ts`, `lib/os-bridge/keychain.ts`.

## Desktop downloads use a native save dialog

The desktop webview ignores anchor download clicks.

Lives in `lib/os-bridge/os.ts`.

## A refused browser open resolves false

The web build's browser can refuse; the shell rejects typed (`url_open_failure.rs`) so the report layer can classify a browserless machine.

Lives in `lib/os-bridge/os.ts`.

## Linux and Windows notifications are native

Their plugin gives no click event, so the shell shows the notification and emits a click event itself.

Lives in `lib/os-bridge/os.ts`.

## Sidecar address can be pulled

The one-shot ready event can race ahead of the listener, so the address is also pullable.

Lives in `lib/os-bridge/os.ts`.

## Updater downloads in Rust

The shell's resumable client retries with backoff and resumes across dropped streams. On Windows the installer hand-off exits the process.

Lives in `lib/os-bridge/updater.ts`.

## Dictation bytes ride the IPC payload

WAV bytes go through the raw-payload pattern; transcription runs entirely on the machine.

Lives in `lib/os-bridge/dictation.ts`.

## Migration backup and source host

A full sibling backup is made before upload; spawning the source host can block for minutes.

Lives in `lib/os-bridge/migration.ts`.

## Shell detection

`osIsTauri()` is the load-bearing distinction between the desktop shell and a browser. Mobile shells are identified separately, and whether a non-click URL open passes pop-up blocking is per shell.

Lives in `lib/os-bridge/platform.ts`.

## Native crash test command

A hidden diagnostics command panics in native code so release builds can verify symbolication.

Lives in `lib/os-bridge/diagnostics.ts`.
