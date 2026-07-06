//! Log hygiene for frpc output.
//!
//! Two concerns, isolated here so they're easy to audit: (1) turning a raw frpc
//! error line into a BOUNDED, user-safe reason ([`friendly_error`]) so we never
//! surface arbitrary frpc bytes; and (2) redacting secret-looking runs before a
//! line is debug-logged ([`redact_secrets`]) — defense-in-depth in case frpc
//! ever echoes the login token or a proxy key.

/// Map a (lowercased) frpc error line to a short, fixed, user-safe reason. The
/// input is only inspected for known substrings; the OUTPUT is a constant
/// string, so no raw frpc bytes (or any secret) can ride along.
pub fn friendly_error(l: &str) -> String {
    if l.contains("login to server failed") {
        "The tunnel relay rejected the connection credentials.".to_string()
    } else if l.contains("connect to server error") {
        "Couldn't reach the tunnel relay.".to_string()
    } else if l.contains("already exists") || l.contains("already in use") {
        "That tunnel subdomain is already in use.".to_string()
    } else if l.contains("start error") {
        "The tunnel failed to start.".to_string()
    } else {
        "The tunnel hit an error.".to_string()
    }
}

/// Mask any run of >=32 chars from the token/key alphabet (`[A-Za-z0-9+/=_-]`)
/// with `***`. Catches hex proxy keys and base64/HMAC tokens; short words, IPs,
/// and ordinary prose pass through so log lines stay useful.
pub fn redact_secrets(line: &str) -> String {
    let is_secret_char =
        |c: char| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=' | '_' | '-');
    let mut out = String::with_capacity(line.len());
    let mut run_start = 0usize;
    let mut in_run = false;
    for (i, c) in line.char_indices() {
        match (is_secret_char(c), in_run) {
            (true, false) => {
                in_run = true;
                run_start = i;
            }
            (true, true) => {}
            (false, true) => {
                push_run(&mut out, &line[run_start..i]);
                in_run = false;
                out.push(c);
            }
            (false, false) => out.push(c),
        }
    }
    if in_run {
        push_run(&mut out, &line[run_start..]);
    }
    out
}

fn push_run(out: &mut String, run: &str) {
    if run.len() >= 32 {
        out.push_str("***");
    } else {
        out.push_str(run);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn friendly_error_maps_known_reasons() {
        assert_eq!(
            friendly_error("login to server failed: token mismatch"),
            "The tunnel relay rejected the connection credentials."
        );
        assert_eq!(
            friendly_error("start error: proxy [x] already exists"),
            "That tunnel subdomain is already in use."
        );
        assert_eq!(
            friendly_error("some other error"),
            "The tunnel hit an error."
        );
    }

    #[test]
    fn redact_secrets_masks_long_key_keeps_prose() {
        let key = "a".repeat(64);
        let line = format!("[I] proxy started with key {key} on port 5555");
        let out = redact_secrets(&line);
        assert!(!out.contains(&key), "long key must be masked");
        assert!(out.contains("***"));
        assert!(out.contains("proxy started"));
        assert!(out.contains("port 5555"));
        // Short tokens and IP-like text are untouched.
        assert_eq!(
            redact_secrets("connect to 10.0.0.1:7000 ok"),
            "connect to 10.0.0.1:7000 ok"
        );
    }
}
