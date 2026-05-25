//! Build script: embed an `asInvoker` UAC manifest on Windows (MSVC).
//!
//! Why this exists: cargo names this crate's test harness
//! `houston_claude_installer-<hash>.exe`. Windows' UAC "Installer
//! Detection" heuristic flags any *unmanifested* executable whose file
//! name contains `install` / `setup` / `update` / `patch` as an
//! installer and refuses to launch it without elevation. So
//! `cargo test -p houston-claude-installer` died with
//! `The requested operation requires elevation. (os error 740)`
//! (`ERROR_ELEVATION_REQUIRED`) before a single test could run — the
//! build succeeded, only the *launch* was blocked.
//!
//! The documented cure is to embed an application manifest that declares
//! an explicit `requestedExecutionLevel`. The moment an exe carries one,
//! Installer Detection is bypassed entirely. We request `asInvoker`: the
//! installer genuinely needs no elevation (it downloads into per-user
//! `%LOCALAPPDATA%\Programs\claude\`), so it should run with exactly the
//! rights of whoever launched it.
//!
//! Scope — MSVC only:
//! - The GNU target (`x86_64-pc-windows-gnu`) is used in this repo solely
//!   for a cross-`cargo check` from macOS (see `knowledge-base/
//!   windows-testing.md`). `check` never links or launches a binary, so
//!   embedding there would buy nothing and would force a hard `windres`
//!   dependency onto that flow.
//! - Non-Windows hosts no-op.
//!
//! These linker flags use `rustc-link-arg` (not `-bins`) on purpose, so
//! they reach the *test* harness — the bin (`houston-engine`) links fine
//! unelevated because its name doesn't trip the heuristic; the test exe
//! is the only artifact that does.

use std::env;
use std::fs;
use std::path::PathBuf;

const ASINVOKER_MANIFEST: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    // Gate strictly on Windows-MSVC. `CARGO_CFG_*` are set by cargo for
    // the *target* being built, so a cross build from macOS evaluates
    // these correctly and skips the MSVC-only linker flags.
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }

    // Drop the manifest in OUT_DIR (cargo guarantees it exists) and feed
    // it to the linker. link.exe merges it with rustc's default manifest,
    // which carries no `requestedExecutionLevel` — that absence is the
    // whole reason Installer Detection fires — so there's no conflict.
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is set by cargo for build scripts"));
    let manifest_path = out_dir.join("asinvoker.manifest");
    fs::write(&manifest_path, ASINVOKER_MANIFEST).expect("failed to write asInvoker manifest to OUT_DIR");

    // One `rustc-link-arg` value == one linker argument (cargo does not
    // re-split on spaces), so a manifest path containing spaces is passed
    // through intact without extra quoting.
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest_path.display());
}
