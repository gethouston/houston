//! Bundled frpc tunnel supervisor.
//!
//! Spawns the frp client (`fatedier/frp`, Apache-2.0) pointing the local auth
//! proxy at the relay under a subdomain, so the local model server is reachable
//! at `https://<subdomain>.tunnels.gethouston.ai`. The child gets the SAME
//! orphan-prevention discipline as the engine sidecar via [`crate::child_guard`]
//! (Unix process group + `killpg`, Windows kill-on-close Job Object, kill on
//! `Drop`). frpc reconnects to the relay on its own, so there is no restart
//! loop here; we only parse its logs to drive bridge status.

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::child_guard;
use crate::local_bridge::log_sanitize;
use crate::local_bridge::BridgeStatusKind;

/// Callback invoked (from log-reader threads) whenever frpc's state changes.
pub type StatusCallback = Arc<dyn Fn(BridgeStatusKind, Option<String>) + Send + Sync>;

/// Everything needed to render the frpc config and spawn it.
pub struct FrpcParams<'a> {
    pub binary: std::path::PathBuf,
    pub config_dir: &'a Path,
    pub relay_host: String,
    pub relay_port: u16,
    pub subdomain: String,
    pub token: String,
    /// `wss` or `tcp` — the frpc→frps transport (TLS always on).
    pub transport: String,
    pub local_port: u16,
}

/// A running frpc child. Drop (or [`kill`](FrpcSupervisor::kill)) to terminate.
pub struct FrpcSupervisor {
    child: Arc<Mutex<Option<Child>>>,
    stopping: Arc<AtomicBool>,
    #[cfg(windows)]
    _job: child_guard::win_job::KillOnCloseJob,
}

impl FrpcSupervisor {
    pub fn spawn(params: FrpcParams, on_status: StatusCallback) -> Result<Self, String> {
        let config = render_config(&params)?;
        std::fs::create_dir_all(params.config_dir)
            .map_err(|e| format!("frpc: create config dir: {e}"))?;
        let config_path = params.config_dir.join("frpc.toml");
        std::fs::write(&config_path, config.as_bytes())
            .map_err(|e| format!("frpc: write config: {e}"))?;
        // The config embeds the relay auth token — keep it owner-only.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("frpc: chmod config: {e}"))?;
        }

        let mut cmd = Command::new(&params.binary);
        cmd.arg("-c")
            .arg(&config_path)
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
            cmd.creation_flags(
                child_guard::CREATE_NEW_PROCESS_GROUP | child_guard::CREATE_NO_WINDOW,
            );
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("frpc: spawn {}: {e}", params.binary.display()))?;

        #[cfg(windows)]
        let _job = match child_guard::win_job::assign(&child) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                return Err(format!("frpc: bind to job object: {e}"));
            }
        };

        let stdout = child.stdout.take().ok_or("frpc: no stdout")?;
        let stderr = child.stderr.take().ok_or("frpc: no stderr")?;
        let stopping = Arc::new(AtomicBool::new(false));

        // stdout reader also detects process exit (EOF) and, unless we asked it
        // to stop, reports the tunnel as errored.
        spawn_reader(stdout, on_status.clone(), stopping.clone(), true);
        spawn_reader(stderr, on_status, stopping.clone(), false);

        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
            stopping,
            #[cfg(windows)]
            _job,
        })
    }

    pub fn kill(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                #[cfg(unix)]
                {
                    child_guard::kill_process_group(child.id() as i32);
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

impl Drop for FrpcSupervisor {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Read frpc log lines, mapping them to status transitions. On EOF (process
/// exit) the primary reader reports an error unless a deliberate stop is in
/// progress.
fn spawn_reader<R: std::io::Read + Send + 'static>(
    stream: R,
    on_status: StatusCallback,
    stopping: Arc<AtomicBool>,
    report_exit: bool,
) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let trimmed = line.trim_end();
                    if trimmed.is_empty() {
                        continue;
                    }
                    // Redact secret-looking runs before logging: the login token
                    // lives only in the 0600 frpc.toml and isn't logged by frpc,
                    // but this is defense-in-depth so no raw line can ever leak a
                    // token/proxy key while keeping the message for debugging.
                    tracing::debug!(
                        "[local-bridge:frpc] {}",
                        log_sanitize::redact_secrets(trimmed)
                    );
                    if let Some((kind, detail)) = classify(trimmed) {
                        on_status(kind, detail);
                    }
                }
            }
        }
        if report_exit && !stopping.load(Ordering::SeqCst) {
            on_status(
                BridgeStatusKind::Error,
                Some("frpc tunnel process exited".to_string()),
            );
        }
    });
}

/// Map a frpc log line to a status change, or `None` if it's not a marker.
/// Error details are mapped to a BOUNDED, known-safe summary via
/// [`log_sanitize::friendly_error`] — we never surface arbitrary frpc bytes.
fn classify(line: &str) -> Option<(BridgeStatusKind, Option<String>)> {
    let l = line.to_ascii_lowercase();
    if l.contains("login to server success") || l.contains("start proxy success") {
        Some((BridgeStatusKind::Online, None))
    } else if l.contains("login to server failed")
        || l.contains("connect to server error")
        || l.contains("start error")
    {
        Some((
            BridgeStatusKind::Error,
            Some(log_sanitize::friendly_error(&l)),
        ))
    } else {
        None
    }
}

/// Render an frpc TOML config (frp v0.52+ format). Fails on an unsupported
/// transport rather than writing a config frpc would reject at boot.
fn render_config(params: &FrpcParams) -> Result<String, String> {
    let protocol = match params.transport.as_str() {
        "wss" | "tcp" => &params.transport,
        other => {
            return Err(format!(
                "frpc: unsupported transport {other:?} (want wss|tcp)"
            ))
        }
    };
    // The per-user minted token is sent as GLOBAL login metadata
    // (`metadatas.token`), NOT frp's built-in `[auth] token`. The relay's frps
    // auth-plugin authorizes Login from `content.metas.token` and NewProxy from
    // `content.user.metas.token` — both fed by this top-level `metadatas` map.
    // (frp's `[auth] token` is a static in-process secret checked by frps
    // against ITS OWN config, which is not our HMAC — so we don't set it.)
    // Dotted top-level keys must precede any `[table]` header to stay global.
    Ok(format!(
        "serverAddr = \"{server}\"\n\
         serverPort = {port}\n\
         loginFailExit = false\n\
         metadatas.token = \"{token}\"\n\
         \n\
         [log]\n\
         to = \"console\"\n\
         level = \"info\"\n\
         \n\
         [transport]\n\
         protocol = \"{protocol}\"\n\
         [transport.tls]\n\
         enable = true\n\
         \n\
         [[proxies]]\n\
         name = \"{subdomain}\"\n\
         type = \"http\"\n\
         localIP = \"127.0.0.1\"\n\
         localPort = {local_port}\n\
         subdomain = \"{subdomain}\"\n",
        server = toml_escape(&params.relay_host),
        port = params.relay_port,
        token = toml_escape(&params.token),
        protocol = protocol,
        subdomain = toml_escape(&params.subdomain),
        local_port = params.local_port,
    ))
}

/// Escape a value for a TOML basic string (`"..."`).
fn toml_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn params() -> FrpcParams<'static> {
        FrpcParams {
            binary: PathBuf::from("frpc"),
            config_dir: Path::new("/tmp"),
            relay_host: "relay.gethouston.ai".to_string(),
            relay_port: 7000,
            subdomain: "abc123".to_string(),
            token: "tok".to_string(),
            transport: "wss".to_string(),
            local_port: 5555,
        }
    }

    #[test]
    fn config_has_required_fields() {
        let cfg = render_config(&params()).unwrap();
        assert!(cfg.contains("serverAddr = \"relay.gethouston.ai\""));
        assert!(cfg.contains("serverPort = 7000"));
        assert!(cfg.contains("protocol = \"wss\""));
        assert!(cfg.contains("enable = true")); // TLS on
                                                // Token rides as GLOBAL login metadata (frps auth-plugin reads
                                                // content.metas.token), NOT frp's built-in [auth] token.
        assert!(cfg.contains("metadatas.token = \"tok\""));
        assert!(!cfg.contains("[auth]"));
        assert!(cfg.contains("subdomain = \"abc123\""));
        assert!(cfg.contains("localPort = 5555"));
        assert!(cfg.contains("type = \"http\""));
    }

    /// The token must be GLOBAL login metadata (dotted key before any table),
    /// never a per-proxy `[proxies.metadatas]` entry — the plugin's Login op
    /// authorizes from `content.metas.token`.
    #[test]
    fn token_is_global_login_metadata() {
        let cfg = render_config(&params()).unwrap();
        let meta = cfg
            .find("metadatas.token")
            .expect("metadatas.token present");
        let first_table = cfg.find('[').unwrap_or(cfg.len());
        assert!(meta < first_table, "metadatas.token must precede any table");
    }

    #[test]
    fn tcp_transport_allowed() {
        let mut p = params();
        p.transport = "tcp".to_string();
        assert!(render_config(&p).unwrap().contains("protocol = \"tcp\""));
    }

    #[test]
    fn rejects_unknown_transport() {
        let mut p = params();
        p.transport = "quic".to_string();
        assert!(render_config(&p).is_err());
    }

    #[test]
    fn escapes_quotes_in_token() {
        let mut p = params();
        p.token = "a\"b\\c".to_string();
        assert!(render_config(&p)
            .unwrap()
            .contains("metadatas.token = \"a\\\"b\\\\c\""));
    }

    #[test]
    fn classify_markers() {
        assert!(matches!(
            classify("[I] login to server success"),
            Some((BridgeStatusKind::Online, _))
        ));
        assert!(matches!(
            classify("connect to server error: dial tcp"),
            Some((BridgeStatusKind::Error, Some(_)))
        ));
        assert!(classify("some unrelated log line").is_none());
    }

    /// Error details are the bounded friendly summary, NOT the raw frpc line —
    /// so nothing from frpc's output (secrets included) can reach the user.
    #[test]
    fn error_detail_is_bounded_summary_not_raw() {
        let raw = "connect to server error: dial tcp 10.0.0.1:7000 secret-abcdef";
        let Some((BridgeStatusKind::Error, Some(detail))) = classify(raw) else {
            panic!("expected an error classification");
        };
        assert_eq!(detail, "Couldn't reach the tunnel relay.");
        assert!(!detail.contains("secret-abcdef"));
        assert!(!detail.contains("10.0.0.1"));
    }

    /// Lifetime discipline: spawn a real long-lived child and confirm kill()
    /// reaps it promptly.
    #[cfg(unix)]
    #[test]
    fn kill_terminates_child() {
        use std::time::{Duration, Instant};

        // Bypass render/spawn (no frpc binary in tests): drive a sleep child
        // through the SAME kill path (process group + kill + wait).
        let mut cmd = Command::new("sleep");
        cmd.arg("30").stdout(Stdio::null()).stderr(Stdio::null());
        unsafe {
            use std::os::unix::process::CommandExt;
            cmd.pre_exec(child_guard::set_new_process_group);
        }
        let child = cmd.spawn().expect("spawn sleep");
        let sup = FrpcSupervisor {
            child: Arc::new(Mutex::new(Some(child))),
            stopping: Arc::new(AtomicBool::new(false)),
        };
        sup.kill();

        // After kill the handle is taken; a second kill is a no-op and the
        // process is gone well within the deadline.
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if sup.child.lock().unwrap().is_none() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(sup.child.lock().unwrap().is_none());
    }
}
