//! Undo the AppImage runtime's environment mutations before spawning
//! children that live outside the bundle.
//!
//! When Houston runs from an AppImage, the type-2 runtime and linuxdeploy's
//! AppRun hook export `LD_LIBRARY_PATH`, `PATH`, GTK/GDK/GIO module caches,
//! `GSETTINGS_SCHEMA_DIR`, `QT_PLUGIN_PATH`, `PYTHONPATH`, … all pointing into
//! the transient squashfs mount, plus the unconditional `GDK_BACKEND=x11` and
//! `GTK_THEME` overrides. Those values are correct ONLY for binaries inside
//! the bundle. A child that lives outside it — the user's browser via
//! `xdg-open` (the Google/Microsoft OAuth consent step), `zenity`, the file
//! manager, or the engine sidecar's own descendants — loads the bundle's
//! libraries instead of the system's and typically crashes on startup. That
//! is exactly how OAuth sign-in broke on Linux: the consent page never
//! opened because the browser died under the bundle's `LD_LIBRARY_PATH`.
//!
//! [`sanitized_env_overrides`] computes the undo list for one spawn:
//! path-list variables get their bundle-mount entries stripped (anything the
//! user had outside the mount is preserved), single-path module variables
//! pointing into the mount are dropped, and the AppRun-forced values plus the
//! AppImage identity variables are dropped outright. Outside an AppImage
//! (dev builds, macOS, Windows) the list is empty and spawns are untouched.

// Everything below the public entry points is reachable only from the
// `target_os = "linux"` branch (and the tests); other platforms compile the
// empty-list path, so silence their dead-code lint rather than cfg-ing the
// pure logic out from under the cross-platform unit tests.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

/// `(key, Some(new_value))` → set; `(key, None)` → remove.
pub type EnvOverride = (&'static str, Option<String>);

/// Colon-separated search-path variables: strip entries under the mount,
/// keep the rest.
const LIST_VARS: &[&str] = &[
    "PATH",
    "LD_LIBRARY_PATH",
    "XDG_DATA_DIRS",
    "GTK_PATH",
    "GIO_EXTRA_MODULES",
    "GSETTINGS_SCHEMA_DIR",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "QT_PLUGIN_PATH",
    "PYTHONPATH",
    "PERLLIB",
];

/// Single-path variables: drop entirely when they point into the mount.
const PREFIX_VARS: &[&str] = &[
    "GDK_PIXBUF_MODULE_FILE",
    "GDK_PIXBUF_MODULE_DIR",
    "GTK_IM_MODULE_FILE",
    "GTK_DATA_PREFIX",
    "GTK_EXE_PREFIX",
    "PYTHONHOME",
];

/// AppRun exports these unconditionally (not mount-prefixed), and the
/// AppImage identity vars confuse child processes that do their own
/// AppImage detection. Drop whenever we are inside an AppImage.
const ALWAYS_REMOVE: &[&str] = &[
    "GDK_BACKEND",
    "GTK_THEME",
    "APPDIR",
    "APPIMAGE",
    "ARGV0",
    "OWD",
];

/// The env fixes to apply to a child spawn. Empty unless running from a
/// Linux AppImage (detected via `APPDIR`, which the runtime always exports).
pub fn sanitized_env_overrides() -> Vec<EnvOverride> {
    #[cfg(not(target_os = "linux"))]
    {
        Vec::new()
    }
    #[cfg(target_os = "linux")]
    {
        match std::env::var("APPDIR") {
            Ok(appdir) if !appdir.trim().is_empty() => {
                overrides_for(&appdir, |key| std::env::var(key).ok())
            }
            _ => Vec::new(),
        }
    }
}

/// Apply [`sanitized_env_overrides`] to a `std::process::Command`.
pub fn sanitize_std_command(cmd: &mut std::process::Command) {
    for (key, value) in sanitized_env_overrides() {
        match value {
            Some(v) => {
                cmd.env(key, v);
            }
            None => {
                cmd.env_remove(key);
            }
        }
    }
}

/// Apply [`sanitized_env_overrides`] to a `tokio::process::Command`.
pub fn sanitize_tokio_command(cmd: &mut tokio::process::Command) {
    for (key, value) in sanitized_env_overrides() {
        match value {
            Some(v) => {
                cmd.env(key, v);
            }
            None => {
                cmd.env_remove(key);
            }
        }
    }
}

/// Pure core, unit-tested on every platform: given the mount dir and an env
/// reader, compute the override list.
fn overrides_for(appdir: &str, get: impl Fn(&str) -> Option<String>) -> Vec<EnvOverride> {
    let mut overrides: Vec<EnvOverride> = Vec::new();
    for &var in LIST_VARS {
        let Some(value) = get(var) else { continue };
        let kept: Vec<&str> = value
            .split(':')
            .filter(|entry| !entry.is_empty() && !path_is_under(entry, appdir))
            .collect();
        let filtered = kept.join(":");
        if filtered != value {
            overrides.push((var, (!filtered.is_empty()).then_some(filtered)));
        }
    }
    for &var in PREFIX_VARS {
        if get(var).is_some_and(|value| path_is_under(&value, appdir)) {
            overrides.push((var, None));
        }
    }
    for &var in ALWAYS_REMOVE {
        if get(var).is_some() {
            overrides.push((var, None));
        }
    }
    overrides
}

/// True when `path` equals the mount dir or lives beneath it. Trailing-slash
/// tolerant on both sides (AppRun emits `$APPDIR//usr/lib/...` doubles).
fn path_is_under(path: &str, appdir: &str) -> bool {
    let base = appdir.trim_end_matches('/');
    if base.is_empty() {
        return false;
    }
    let candidate = path.trim_end_matches('/');
    candidate == base
        || candidate
            .strip_prefix(base)
            .is_some_and(|rest| rest.starts_with('/'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    const APPDIR: &str = "/tmp/.mount_HoustoXYZ";

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn run(vars: &HashMap<String, String>) -> HashMap<&'static str, Option<String>> {
        overrides_for(APPDIR, |key| vars.get(key).cloned())
            .into_iter()
            .collect()
    }

    #[test]
    fn strips_mount_entries_but_keeps_user_entries() {
        let vars = env(&[(
            "PATH",
            "/tmp/.mount_HoustoXYZ/usr/bin/:/tmp/.mount_HoustoXYZ/usr/sbin/:/usr/local/bin:/usr/bin",
        )]);
        let out = run(&vars);
        assert_eq!(
            out.get("PATH"),
            Some(&Some("/usr/local/bin:/usr/bin".to_string()))
        );
    }

    #[test]
    fn removes_var_when_only_mount_entries_remain() {
        let vars = env(&[(
            "LD_LIBRARY_PATH",
            "/tmp/.mount_HoustoXYZ/usr/lib/:/tmp/.mount_HoustoXYZ/lib/x86_64-linux-gnu/:",
        )]);
        let out = run(&vars);
        assert_eq!(out.get("LD_LIBRARY_PATH"), Some(&None));
    }

    #[test]
    fn untouched_list_var_is_not_overridden() {
        let vars = env(&[("PATH", "/usr/local/bin:/usr/bin")]);
        assert!(run(&vars).is_empty());
    }

    #[test]
    fn double_slash_hook_paths_are_recognized() {
        // linuxdeploy's gtk hook emits `$APPDIR//usr/lib/...` doubles.
        let vars = env(&[(
            "GTK_PATH",
            "/tmp/.mount_HoustoXYZ//usr/lib/x86_64-linux-gnu/gtk-3.0:/usr/lib/x86_64-linux-gnu/gtk-3.0",
        )]);
        let out = run(&vars);
        assert_eq!(
            out.get("GTK_PATH"),
            Some(&Some("/usr/lib/x86_64-linux-gnu/gtk-3.0".to_string()))
        );
    }

    #[test]
    fn prefix_vars_dropped_only_when_inside_mount() {
        let inside = env(&[(
            "GDK_PIXBUF_MODULE_FILE",
            "/tmp/.mount_HoustoXYZ//usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache",
        )]);
        assert_eq!(run(&inside).get("GDK_PIXBUF_MODULE_FILE"), Some(&None));

        let outside = env(&[(
            "GDK_PIXBUF_MODULE_FILE",
            "/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache",
        )]);
        assert!(run(&outside).is_empty());
    }

    #[test]
    fn forced_and_identity_vars_are_removed() {
        let vars = env(&[
            ("GDK_BACKEND", "x11"),
            ("GTK_THEME", "Adwaita:light"),
            ("APPDIR", APPDIR),
            ("APPIMAGE", "/home/user/Houston.AppImage"),
        ]);
        let out = run(&vars);
        assert_eq!(out.get("GDK_BACKEND"), Some(&None));
        assert_eq!(out.get("GTK_THEME"), Some(&None));
        assert_eq!(out.get("APPDIR"), Some(&None));
        assert_eq!(out.get("APPIMAGE"), Some(&None));
    }

    #[test]
    fn sibling_mount_prefix_is_not_confused_with_the_mount() {
        // `/tmp/.mount_HoustoXYZ2/...` must NOT match `/tmp/.mount_HoustoXYZ`.
        assert!(!path_is_under("/tmp/.mount_HoustoXYZ2/usr/lib", APPDIR));
        assert!(path_is_under("/tmp/.mount_HoustoXYZ/usr/lib", APPDIR));
        assert!(path_is_under("/tmp/.mount_HoustoXYZ", APPDIR));
    }
}
