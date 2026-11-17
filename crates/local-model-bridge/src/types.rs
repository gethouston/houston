use serde::Serialize;

/// Deliberately does not implement Debug: both credentials remain local secrets.
pub struct BridgeConfig {
    pub connect_url: String,
    pub ticket: String,
    pub target_base_url: String,
    pub model: String,
    pub local_api_key: Option<String>,
}
#[derive(Clone, Debug, Serialize, thiserror::Error, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BridgeError {
    #[error("Invalid local model address")]
    InvalidTarget,
    #[error("Invalid bridge configuration")]
    InvalidConfig,
    /// The socket never opened: DNS, TCP, TLS, or the network dropped.
    #[error("Bridge connection failed")]
    Connection,
    /// The relay or gateway answered the handshake with an HTTP refusal (an
    /// unaccepted ticket, no relay ready). Kept apart from `Connection` so an
    /// outage on our side is not reported as the device being offline.
    #[error("Bridge connection refused ({status})")]
    Refused { status: u16 },
    #[error("Invalid bridge protocol")]
    Protocol,
    #[error("Bridge operation timed out")]
    Timeout,
    #[error("Bridge session expired")]
    Expired,
    #[error("Bridge is disconnected")]
    Closed,
}
impl BridgeError {
    pub(crate) fn handshake(error: tokio_tungstenite::tungstenite::Error) -> Self {
        match error {
            tokio_tungstenite::tungstenite::Error::Http(response) => Self::Refused {
                status: response.status().as_u16(),
            },
            _ => Self::Connection,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BridgeStatus {
    #[serde(rename_all = "camelCase")]
    Online {
        generation: u64,
        session_expires_at: String,
    },
    #[serde(rename_all = "camelCase")]
    Renewed {
        session_expires_at: String,
    },
    /// Fired two minutes before the session expires (and again after every
    /// renewal). The host must mint a fresh ticket and call `renew`: the
    /// desktop webview's own timers are suspended while the app idles in
    /// the background, so a schedule kept only there let sessions lapse.
    #[serde(rename_all = "camelCase")]
    RenewalDue {
        session_expires_at: String,
    },
    Draining,
    ModelUnavailable,
    Offline {
        error: Option<BridgeError>,
    },
}

#[cfg(test)]
mod tests {
    use super::BridgeError;
    use tokio_tungstenite::tungstenite::{http::Response, Error};

    #[test]
    fn handshake_refusal_keeps_its_status() {
        for status in [401u16, 403, 502, 503] {
            let response = Response::builder().status(status).body(None).unwrap();
            let error = BridgeError::handshake(Error::Http(Box::new(response)));
            assert_eq!(error, BridgeError::Refused { status });
            assert_eq!(
                error.to_string(),
                format!("Bridge connection refused ({status})")
            );
        }
    }

    #[test]
    fn transport_failure_stays_connection() {
        let io = std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "refused");
        let error = BridgeError::handshake(Error::Io(io));
        assert_eq!(error, BridgeError::Connection);
        assert_eq!(error.to_string(), "Bridge connection failed");
    }
}
