//! `transcribe_audio`: run the bundled `whisper-cli` over a recorded WAV.
//!
//! The raw 16 kHz mono 16-bit PCM audio rides the IPC payload as
//! [`InvokeBody::Raw`] (JSON-encoding a multi-megabyte clip number-by-number
//! would freeze the webview — same reasoning as `commands::save_file`). The
//! language hint travels in the `x-dictation-lang` header. The sidecar child
//! gets the SAME orphan-prevention discipline as the engine sidecar
//! (Unix process group + `killpg`, Windows kill-on-close Job Object).

use std::io::{BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use super::args::{build_args, normalize_lang};
use super::stderr_tail::drain_tail;
use super::temp_wav::TempWav;
use super::types::DictationError;
use super::{cpu, model, wav};
use crate::child_guard;

#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    request: Request<'_>,
) -> Result<String, DictationError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("transcribe_audio expects a raw byte payload".into());
    };
    let lang = normalize_lang(
        request
            .headers()
            .get("x-dictation-lang")
            .and_then(|v| v.to_str().ok()),
    );

    // Gate BEFORE spawning: on a pre-AVX2 x86-64 the sidecar dies with an
    // illegal instruction (0xc000001d on Windows). Exact string — the
    // frontend maps it to translated "this computer can't run voice typing"
    // copy with no bug report: nothing in Houston broke.
    if !cpu::cpu_supported() {
        return Err("dictation-unsupported-cpu".into());
    }

    let model_path = model::model_path(&app)?;
    // Exact string — the frontend maps it to the "download the model" flow,
    // which also replaces a wrong-size file (see `model::is_ready`).
    if !model::is_ready(&model_path) {
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

/// Spawn the hardened child, drain its stdout and stderr, and enforce the
/// timeout by polling `try_wait`. On timeout the whole process group / job is
/// killed and `transcription-timeout` returned. Both failures carry the
/// stderr tail: whisper-cli names its crash site there and nowhere else.
async fn run_whisper(
    binary: &Path,
    args: &[String],
    timeout: Duration,
) -> Result<String, DictationError> {
    let mut cmd = Command::new(binary);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
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
            return Err(format!("dictation: bind to job object: {e}").into());
        }
    };

    // Drain both pipes on threads so a full pipe buffer can't deadlock the
    // child (whisper logs its whole model load to stderr).
    let stdout = child.stdout.take().ok_or("dictation: no stdout")?;
    let stdout_reader = std::thread::spawn(move || {
        let mut buf = String::new();
        BufReader::new(stdout).read_to_string(&mut buf).map(|_| buf)
    });
    let stderr = child.stderr.take().ok_or("dictation: no stderr")?;
    let stderr_reader = std::thread::spawn(move || drain_tail(stderr));

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
                // Reap so the pipes close and the tail thread reaches EOF: what
                // whisper printed before it hung is the only clue to why.
                child
                    .wait()
                    .map_err(|e| format!("dictation: reap after timeout: {e}"))?;
                let tail = join_tail(stderr_reader);
                tracing::warn!(
                    "[dictation] whisper timed out after {timeout:?}; stderr tail: {tail}"
                );
                return Err(DictationError::sidecar("transcription-timeout", tail));
            }
            None => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    };

    let text = stdout_reader
        .join()
        .map_err(|_| "dictation: stdout reader panicked".to_string())?
        .map_err(|e| format!("dictation: read whisper stdout: {e}"))?;
    let tail = join_tail(stderr_reader);
    if !status.success() {
        // Exact wording of the pre-existing message: the Sentry issue per exit
        // flavor stays continuous, the tail is what is new (PRODUCT-1731).
        tracing::warn!("[dictation] whisper exited with {status}; stderr tail: {tail}");
        return Err(DictationError::sidecar(
            format!("dictation: whisper exited with {status}"),
            tail,
        ));
    }
    Ok(text.trim().to_string())
}

/// A panicked tail thread yields a marker, never a lost transcription result:
/// the tail is context for a failure, not a failure of its own.
fn join_tail(reader: JoinHandle<String>) -> String {
    reader
        .join()
        .unwrap_or_else(|_| "<stderr reader panicked>".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real child that writes to stderr and exits non-zero: the failure must
    /// carry the END of stderr, with the exit-status wording unchanged.
    #[tokio::test]
    #[cfg(unix)]
    async fn nonzero_exit_carries_stderr_tail() {
        let script = "for i in $(seq 1 300); do echo \"whisper_model_load: line $i\" >&2; done; \
                      echo 'ggml.c:9: GGML_ASSERT(rc == 0) failed' >&2; exit 3";
        let args = vec!["-c".to_string(), script.to_string()];
        let err = run_whisper(Path::new("/bin/sh"), &args, Duration::from_secs(10))
            .await
            .unwrap_err();
        match err {
            DictationError::SidecarFailure {
                message,
                stderr_tail,
                ..
            } => {
                assert_eq!(message, "dictation: whisper exited with exit status: 3");
                assert!(
                    stderr_tail.ends_with("GGML_ASSERT(rc == 0) failed"),
                    "tail: {stderr_tail}"
                );
                assert!(stderr_tail.len() <= super::super::stderr_tail::STDERR_TAIL_BYTES);
            }
            other => panic!("expected a sidecar failure, got {other:?}"),
        }
    }

    #[tokio::test]
    #[cfg(unix)]
    async fn timeout_kills_the_child_and_carries_stderr_tail() {
        let script = "echo 'loading model' >&2; sleep 30";
        let args = vec!["-c".to_string(), script.to_string()];
        let started = Instant::now();
        let err = run_whisper(Path::new("/bin/sh"), &args, Duration::from_millis(200))
            .await
            .unwrap_err();
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "child was reaped"
        );
        match err {
            DictationError::SidecarFailure {
                message,
                stderr_tail,
                ..
            } => {
                assert_eq!(message, "transcription-timeout");
                assert_eq!(stderr_tail, "loading model");
            }
            other => panic!("expected a sidecar failure, got {other:?}"),
        }
    }

    #[tokio::test]
    #[cfg(unix)]
    async fn success_returns_trimmed_stdout_and_ignores_stderr() {
        let script = "echo 'noise' >&2; echo '  hello world  '";
        let args = vec!["-c".to_string(), script.to_string()];
        let text = run_whisper(Path::new("/bin/sh"), &args, Duration::from_secs(10))
            .await
            .unwrap();
        assert_eq!(text, "hello world");
    }
}
