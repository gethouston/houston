//! Terminal launch helpers. Kept separate from `os.rs` so each command
//! surface stays small enough to audit.

use std::path::PathBuf;
use tokio::process::Command;

fn expand(p: &str) -> PathBuf {
    super::expand_tilde(&PathBuf::from(p))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_terminal(
    path: String,
    command: Option<String>,
    terminal_app: Option<String>,
) -> Result<(), String> {
    let dir = expand(&path);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", dir.display()));
    }

    let terminal = terminal_app.as_deref().unwrap_or("terminal");
    let dir_str = dir.to_string_lossy();

    let script = match terminal {
        "iterm" => iterm_script(&dir_str, command.as_deref()),
        "warp" => {
            if let Some(cmd) = &command {
                warp_script(&dir_str, cmd)
            } else {
                return open_warp(&dir_str).await;
            }
        }
        _ => terminal_script(&dir_str, command.as_deref()),
    };

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("osascript failed: {stderr}"));
    }

    Ok(())
}

fn iterm_script(dir: &str, command: Option<&str>) -> String {
    if let Some(cmd) = command {
        format!(
            r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd '{}' && {}"
    end tell
end tell"#,
            dir, cmd
        )
    } else {
        format!(
            r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd '{}'"
    end tell
end tell"#,
            dir
        )
    }
}

fn warp_script(dir: &str, command: &str) -> String {
    format!(
        r#"tell application "Warp"
    activate
end tell
delay 0.5
do shell script "open -a Warp '{}'"
delay 0.3
tell application "System Events"
    keystroke "{}"
    key code 36
end tell"#,
        dir, command
    )
}

async fn open_warp(dir: &str) -> Result<(), String> {
    Command::new("open")
        .args(["-a", "Warp", dir])
        .output()
        .await
        .map_err(|e| format!("Failed to open Warp: {e}"))
        .and_then(|o| {
            if o.status.success() {
                Ok(())
            } else {
                Err(format!(
                    "Warp failed: {}",
                    String::from_utf8_lossy(&o.stderr)
                ))
            }
        })
}

fn terminal_script(dir: &str, command: Option<&str>) -> String {
    if let Some(cmd) = command {
        format!(
            r#"tell application "Terminal"
    activate
    do script "cd '{}' && {}"
end tell"#,
            dir, cmd
        )
    } else {
        format!(
            r#"tell application "Terminal"
    activate
    do script "cd '{}'"
end tell"#,
            dir
        )
    }
}
