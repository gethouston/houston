# Windows VM — testing Houston builds from a Mac

Proven setup: macOS (Apple Silicon) host + UTM running **Windows 11 ARM64**. The
x64 Houston build runs there under Windows' x64 emulation — the same path real
Snapdragon/Surface users hit.

## VM setup gotchas (each one bit us; each one will bite again)

- **Network profile must be "Private"** (Settings → Network & internet → Ethernet
  → Network profile type). The default "Public" profile silently blocks inbound
  TCP no matter what firewall rules you add.
- **The bundled OpenSSH Server is broken on Windows 11 ARM64.**
  `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0` reports success,
  but `sshd.exe` never deploys — `C:\Windows\System32\OpenSSH\` gets only the
  client tools and `Get-Service sshd` returns "not found" forever. Install the
  standalone `OpenSSH-ARM64.zip` from PowerShell/Win32-OpenSSH releases instead,
  then `install-sshd.ps1` + `Start-Service sshd` + an inbound TCP/22 firewall rule.
- **Admin accounts ignore `~/.ssh/authorized_keys`.** Microsoft's OpenSSH reads
  `C:\ProgramData\ssh\administrators_authorized_keys` for members of
  Administrators. ACL must be `icacls … /inheritance:r /grant "Administrators:F"
  /grant "SYSTEM:F"` — nothing else, or sshd rejects the file.
- **PowerShell over SSH needs base64.** Windows OpenSSH's default shell is
  cmd.exe, so `$env:VAR` and quoting break. Pass every snippet as
  `powershell -NoProfile -EncodedCommand <base64>`.
- **The process is `houston-app`, not `Houston`.** `Get-Process` drops the `.exe`,
  so kill/match on `houston-app` (`app/src-tauri/Cargo.toml` package name).
- **GUI apps launched over SSH don't appear.** Windows OpenSSH sessions run in
  non-interactive Session 0; a `Start-Process` from there never reaches the
  logged-in user's Session 1 desktop. Launch Houston from the Start menu inside
  the VM.
- **Logs land at `%USERPROFILE%\.houston\logs\`** — `houston_dir()/logs`
  (`app/src-tauri/src/logging.rs:83`), `backend.log` rolled daily plus
  `frontend.log`.

## Windows rules for shell code (`app/src-tauri`)

- **Never read `HOME`.** `std::env::var("HOME")` is `Err` on Windows and the usual
  `"."` fallback scatters `.houston/` into whatever the CWD happened to be
  (`C:\Program Files\Houston\`, `C:\Windows\System32\`, Downloads — all three were
  observed in one session). Use `dirs::home_dir()`; the shell already does at
  every site (`lib.rs:41`, `lib.rs:737`, `commands/mod.rs:23`,
  `commands/save_file.rs:68`).
- **Creating symlinks needs Developer Mode or admin.** Stock Windows installs fail
  with os error 1314 ("A required privilege is not held by the client"). Any new
  code that links content for another tool to read must fall back to `fs::copy`.
  (No live code path creates symlinks today — the migration backup *skips* them.)
- **MSVC cross-compile from macOS is not set up.** `x86_64-pc-windows-msvc` needs
  the MSVC CRT headers via `xwin`, which we never installed. Build the MSI on a
  Windows host or in CI (`cd app && pnpm tauri build --target
  x86_64-pc-windows-msvc`).
