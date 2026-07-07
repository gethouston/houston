//! `transcribe_audio`: run the bundled `whisper-cli` over a recorded WAV.
//!
//! The raw 16 kHz mono 16-bit PCM audio rides the IPC payload as
//! [`InvokeBody::Raw`] (JSON-encoding a multi-megabyte clip number-by-number
//! would freeze the webview — same reasoning as `commands::save_file`). The
//! language hint travels in the `x-dictation-lang` header. The sidecar child
//! gets the SAME orphan-prevention discipline as the engine/frpc sidecars
//! (Unix process group + `killpg`, Windows kill-on-close Job Object).

use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use super::{model, wav};
use crate::child_guard;

/// Monotonic suffix so concurrent transcriptions never collide on a temp path.
static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub async fn transcribe_audio(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("transcribe_audio expects a raw byte payload".into());
    };
    let lang = normalize_lang(
        request
            .headers()
            .get("x-dictation-lang")
            .and_then(|v| v.to_str().ok()),
    );

    let model_path = model::model_path(&app)?;
    if std::fs::metadata(&model_path).is_err() {
        // Exact string — the frontend maps it to the "download the model" flow.
        return Err("model-not-ready".into());
    }

    let resource_dir = app.path().resource_dir().ok();
    let binary = child_guard::resolve_bundled_binary(
        "whisper-cli",
        resource_dir.as_ref(),
        "HOUSTON_WHISPER_BIN",
    )?;

    let wav_file = TempWav::write(bytes)?;
    let threads = wav::clamp_threads(
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
    );
    let timeout = wav::transcription_timeout(wav::duration_secs(bytes));
    let args = build_args(&model_path, wav_file.path(), lang, threads);

    run_whisper(&binary, &args, timeout).await
}

/// Validate the language hint against the supported set; anything missing or
/// unrecognized falls through to whisper's autodetect.
fn normalize_lang(raw: Option<&str>) -> &'static str {
    match raw.map(str::trim) {
        Some("en") => "en",
        Some("es") => "es",
        Some("pt") => "pt",
        _ => "auto",
    }
}

/// `-nt` (no timestamps) + `-np` (no progress prints) keep stdout to the bare
/// transcript; no `-o*` flags means whisper writes no output files.
fn build_args(model: &Path, wav: &Path, lang: &str, threads: usize) -> Vec<String> {
    vec![
        "-m".into(),
        model.to_string_lossy().into_owned(),
        "-f".into(),
        wav.to_string_lossy().into_owned(),
        "-l".into(),
        lang.into(),
        "-t".into(),
        threads.to_string(),
        "-nt".into(),
        "-np".into(),
    ]
}

/// Spawn the hardened child, drain its stdout, and enforce the timeout by
/// polling `try_wait`. On timeout the whole process group / job is killed and
/// `Err("transcription-timeout")` returned.
async fn run_whisper(binary: &Path, args: &[String], timeout: Duration) -> Result<String, String> {
    let mut cmd = Command::new(binary);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        cmd.pre_exec(child_guard::set_new_process_group);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(child_guard::CREATE_NEW_PROCESS_GROUP | child_guard::CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("dictation: spawn {}: {e}", binary.display()))?;

    #[cfg(windows)]
    let _job = match child_guard::win_job::assign(&child) {
        Ok(job) => job,
        Err(e) => {
            child
                .kill()
                .map_err(|e| format!("dictation: kill after job-bind fail: {e}"))?;
            return Err(format!("dictation: bind to job object: {e}"));
        }
    };

    // Drain stdout on a thread so a full pipe buffer can't deadlock the child.
    let stdout = child.stdout.take().ok_or("dictation: no stdout")?;
    let reader = std::thread::spawn(move || {
        let mut buf = String::new();
        BufReader::new(stdout).read_to_string(&mut buf).map(|_| buf)
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child
            .try_wait()
            .map_err(|e| format!("dictation: wait on whisper: {e}"))?
        {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                #[cfg(unix)]
                child_guard::kill_process_group(child.id() as i32);
                #[cfg(windows)]
                child
                    .kill()
                    .map_err(|e| format!("dictation: kill on timeout: {e}"))?;
                return Err("transcription-timeout".into());
            }
            None => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    };

    let text = reader
        .join()
        .map_err(|_| "dictation: stdout reader panicked".to_string())?
        .map_err(|e| format!("dictation: read whisper stdout: {e}"))?;
    if !status.success() {
        return Err(format!("dictation: whisper exited with {status}"));
    }
    Ok(text.trim().to_string())
}

/// A uniquely-named temp WAV whose file is removed when this handle drops,
/// regardless of how the transcription returns.
struct TempWav {
    path: PathBuf,
}

impl TempWav {
    fn write(bytes: &[u8]) -> Result<Self, String> {
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "houston-dictation-{}-{seq}-{nanos}.wav",
            std::process::id()
        ));
        std::fs::write(&path, bytes)
            .map_err(|e| format!("dictation: write temp wav {}: {e}", path.display()))?;
        Ok(Self { path })
    }
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempWav {
    fn drop(&mut self) {
        if let Err(e) = std::fs::remove_file(&self.path) {
            tracing::debug!("dictation: temp wav cleanup failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lang_hint_maps_supported_langs() {
        assert_eq!(normalize_lang(Some("en")), "en");
        assert_eq!(normalize_lang(Some("es")), "es");
        assert_eq!(normalize_lang(Some("pt")), "pt");
        assert_eq!(normalize_lang(Some("auto")), "auto");
    }

    #[test]
    fn lang_hint_defaults_to_auto() {
        assert_eq!(normalize_lang(None), "auto");
        assert_eq!(normalize_lang(Some("fr")), "auto");
        assert_eq!(normalize_lang(Some("")), "auto");
    }

    #[test]
    fn args_carry_model_wav_lang_threads_and_flags() {
        let args = build_args(Path::new("/m/model.bin"), Path::new("/t/clip.wav"), "es", 4);
        assert_eq!(
            args,
            vec![
                "-m",
                "/m/model.bin",
                "-f",
                "/t/clip.wav",
                "-l",
                "es",
                "-t",
                "4",
                "-nt",
                "-np",
            ]
        );
    }

    #[test]
    fn temp_wav_written_then_removed_on_drop() {
        let path;
        {
            let wav = TempWav::write(b"RIFFdata").unwrap();
            path = wav.path().to_path_buf();
            assert_eq!(std::fs::read(&path).unwrap(), b"RIFFdata");
        }
        assert!(!path.exists(), "temp wav removed when handle drops");
    }
}
