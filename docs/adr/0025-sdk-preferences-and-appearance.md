# Account preferences and device appearance

Two SDK modules store a person's settings in different places on purpose. `preferences` (`packages/sdk/src/modules/preferences`) holds per-account key and value preferences on the gateway or host, keyed by the session `sub`, plus the workspace selection and the timezone seed. `appearance` (`packages/sdk/src/modules/appearance`) holds the theme for this device only.

## Preferences are account-scoped

The module calls the flat `PreferencesClient` rooted at the base URL, never `clientFor(agentId)`, and reads on demand with no reactive scope.

### Timezone seed

The cloud scheduler fires routines and the morning briefing in the account `timezone` preference, so every surface seeds it for every signed-in person, not only a screen that shows it. `seedTimezone` (`timezone.ts`) is the one rule:

- Read first. A stored zone is the answer and is never touched. The read comes first so a gateway that predates `onlyIfAbsent` and writes unconditionally still never overwrites a zone the person chose.
- Only an empty key gets a write: the zone this device kept before the preference moved to the account, else the detected zone. It is sent create-only (`onlyIfAbsent: true`), so a race with an explicit choice settles in the choice's favour (412, and the stored value is adopted).
- `usableZone` never sends a zone `TurnTimezoneSchema` rejects, because the server answers 400. Chromium on some Linux hosts reports `Etc/Unknown`, which yields `unseeded`.
- A locked team (403 `needs_upgrade`) yields `locked` and writes nothing; the next seed after the upgrade writes it.

### Workspace selection

`workspaceSelectionPreference` (`workspace-selection.ts`) resolves which space a device opens in and records deliberate choices.

- Boot only reads. A deliberate choice writes the device mirror first and then the account, in one ordered queue bound to the signed-in identity (`WorkspaceSelectionState`). An identity change invalidates queued work, and the state is shared across SDK rebuilds through the `workspaceSelection` port.
- The device mirror (`workspace-selection-device.ts`) is keyed by account, so a device choice never follows a different person on the same browser. When the last account write failed, the device choice is tried before the account one.
- An unavailable account read is not an unset one (`WorkspacePreferenceUnavailable`): boot falls back to this device's previous space. The account preference is read only when a team workspace exists, since with only the personal space there is nothing to choose.
- `workspacePreferenceRequest` bounds the whole response, body included, with its own deadline, even when the transport ignores abort.
- `workspacePreferenceErrorKind` lets every surface report these expected refusals without filing a bug.

## Appearance is device-local

A person can pick dark on the laptop they read at night and light at their desk, and an appearance that followed the account would fight that. So `appearance` has no route and no wire test. It reads and writes three keys (`device-keys.ts`) through the `devicePreferences` port, which the app backs with the device's own store. The key names are the ones every Houston build has written, so an upgrade keeps the existing choice.

It is not an assistant capability and cannot be one. The catalog is derived from the requests an operation issues, and the AI Manager runs in the engine pod, where this device's store does not exist. The person changes appearance in Settings, and the manager can only point them there with a hands-on card (`request_hands_on`).

### Reads

- `readTheme` lands an absent key on its default silently (a fresh install). A key holding something this build cannot use lands on the same default and is named in `ThemeReading.unusable`, so the surface can report it. A store that refuses the read rejects, because unknown is not unset and a caller holding its own mirror should not repaint a guess.
- `parsePaletteId` refuses a palette of the other mode: a dark palette saved under `theme.light` would paint dark colours in light mode.
- `DEFAULT_THEME_PREFERENCE` is `light`, not `system`, so an install that never picked a theme keeps the appearance it always had. Following the OS is a choice the person makes.
- `resolveTheme` is pure: the caller passes the live `prefers-color-scheme` answer, and `followsSystem` says only a `system` choice moves with it. `sameTheme` compares fields, because the on-screen and saved preferences are rebuilt object by object.

### Writes are diff-only and all-or-nothing

`writeChangedKeys` writes only keys whose value moved, so a picker that re-sends the whole preference does not rewrite fields the person never touched. The diff is taken against `base`, what is stored, not what is on screen, so a paint that ran ahead of the write cannot hide a real change. `setTheme` takes `previous` for a surface that painted ahead (a debounced picker); a dispatched write diffs against storage, because a caller across a serialization boundary painted nothing.

One pick can move two keys (a mode and the palette that mode wears). Sending them together could let the store accept one and refuse the other, and the next boot would paint a mode with the previous choice's palette. So keys go out in sequence and a refusal rolls the earlier ones back (`rollback`). Rollback is best effort: a key that stays ahead is named, and the caller hears the original refusal.

`validate.ts` is the one check for both the typed facade (where `light` and `dark` are both `PaletteId`, so the compiler cannot catch a dark id picked for light) and `dispatch`. `InvalidThemeError` throws rather than correcting, because every picker offers exactly `listPalettes`, so a bad patch is a caller bug, and saving a corrected value would show an appearance nobody chose. `patchFromPayload` leaves absent fields alone and refuses present unusable ones.
