//! Tunnel frame protocol — mirrors `houston-relay/src/types.ts`.
//!
//! Every message between the desktop engine and the relay Durable Object
//! is a JSON object with a `kind` discriminator. Keep this in lockstep
//! with the TypeScript twin — both sides must agree on every variant.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TunnelFrame {
    HttpRequest(HttpRequestFrame),
    HttpResponse(HttpResponseFrame),
    WsOpen(WsOpenFrame),
    WsOpenAck(WsOpenAckFrame),
    WsMessage(WsMessageFrame),
    WsClose(WsCloseFrame),
    PairRequest(PairRequestFrame),
    PairResponse(PairResponseFrame),
    Ping(PingFrame),
    Pong(PongFrame),
    /// Desktop → relay: a notification-worthy session lifecycle
    /// transition. The relay forwards it to APNs/FCM for this tunnel's
    /// registered devices. The engine owns policy (cap/dedup) + i18n;
    /// the relay is a dumb push pipe.
    Notify(NotifyFrame),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestFrame {
    pub req_id: String,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    /// base64; None for empty body.
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseFrame {
    pub req_id: String,
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsOpenFrame {
    pub ws_id: String,
    pub path: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsOpenAckFrame {
    pub ws_id: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsMessageFrame {
    pub ws_id: String,
    /// "c2s" (mobile→engine) or "s2c" (engine→mobile).
    pub dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsCloseFrame {
    pub ws_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequestFrame {
    pub req_id: String,
    pub code: String,
    pub device_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponseFrame {
    pub req_id: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine_token: Option<String>,
    /// Debug hint. Clients should switch on [`code`] instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Machine-readable failure classification. Mirror of
    /// `houston-relay/src/types.ts::PairErrorCode`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingFrame {
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PongFrame {
    pub ts: i64,
}

/// Lifecycle transition that warrants a push. Mirror of
/// `houston-relay/src/types.ts::NotifyKind`. `Hash` is needed so
/// `NotifyPolicy` can dedup on `(kind, session_key)` HashMap keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotifyKind {
    /// Agent is blocked waiting on the user.
    NeedsYou,
    /// Session completed successfully.
    Finished,
    /// Session ended in an error.
    Failed,
}

/// Desktop → relay notification payload, shaped for **device-side
/// localization** — the industry-best-practice mechanism shared by APNs
/// (`loc-key` / `loc-args`) and FCM (`body_loc_key` / `body_loc_args`).
/// The engine sends only the semantic event + any substitution args;
/// the relay maps `notify_kind` onto the platform `*_loc_key` strings
/// (e.g. `houston.<kind>.title`, `houston.<kind>.body`); the device
/// localizes from its bundled `Localizable.strings` / `strings.xml` in
/// the user's current OS locale. This keeps payloads minimal, survives
/// locale changes without a server roundtrip, and removes the need for
/// the engine to track each device's locale.
///
/// Note: the inner discriminator is `notifyKind`, not `kind` — `kind`
/// is taken by the [`TunnelFrame`] serde tag.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyFrame {
    pub notify_kind: NotifyKind,
    /// Substitution args for the localized title/body strings (iOS
    /// `%@` in `.strings`, Android `%1$s` in `strings.xml`). For
    /// example `NeedsYou` may carry `[agent_name]`. Maps onto APNs
    /// `body-loc-args` + FCM `body_loc_args`. Empty by default and
    /// omitted from the wire when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub loc_args: Vec<String>,
    /// Deep-link target on push tap (the agent session key).
    pub session_key: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_request_roundtrip() {
        let frame = TunnelFrame::HttpRequest(HttpRequestFrame {
            req_id: "r1".into(),
            method: "GET".into(),
            path: "/v1/health".into(),
            headers: HashMap::new(),
            body: None,
        });
        let s = serde_json::to_string(&frame).unwrap();
        assert!(s.contains("\"kind\":\"http_request\""));
        let parsed: TunnelFrame = serde_json::from_str(&s).unwrap();
        matches!(parsed, TunnelFrame::HttpRequest(_));
    }

    #[test]
    fn ws_message_serde_uses_camel_case_dir() {
        let frame = TunnelFrame::WsMessage(WsMessageFrame {
            ws_id: "w1".into(),
            dir: "s2c".into(),
            text: Some("hello".into()),
            binary: None,
        });
        let s = serde_json::to_string(&frame).unwrap();
        assert!(s.contains("\"wsId\":\"w1\""));
        assert!(s.contains("\"dir\":\"s2c\""));
    }

    #[test]
    fn pair_request_matches_relay_shape() {
        let s = r#"{"kind":"pair_request","reqId":"r","code":"abc-123","deviceLabel":"iPhone"}"#;
        let parsed: TunnelFrame = serde_json::from_str(s).unwrap();
        matches!(parsed, TunnelFrame::PairRequest(_));
    }

    #[test]
    fn ping_roundtrip() {
        let s = serde_json::to_string(&TunnelFrame::Ping(PingFrame { ts: 42 })).unwrap();
        assert!(s.contains("\"kind\":\"ping\""));
    }

    #[test]
    fn notify_roundtrip_and_lockstep_shape() {
        // Device-localizes from notifyKind + locArgs (APNs/FCM loc-key
        // model). No pre-localized title/body on the wire.
        let frame = TunnelFrame::Notify(NotifyFrame {
            notify_kind: NotifyKind::NeedsYou,
            loc_args: vec!["docs-agent".into()],
            session_key: "sess-1".into(),
        });
        let s = serde_json::to_string(&frame).unwrap();
        // Frame discriminator is `kind`; the inner event is `notifyKind`.
        assert!(s.contains("\"kind\":\"notify\""));
        assert!(s.contains("\"notifyKind\":\"needs_you\""));
        assert!(s.contains("\"locArgs\":[\"docs-agent\"]"));
        assert!(s.contains("\"sessionKey\":\"sess-1\""));
        let parsed: TunnelFrame = serde_json::from_str(&s).unwrap();
        assert!(matches!(parsed, TunnelFrame::Notify(_)));
    }

    #[test]
    fn notify_omits_empty_loc_args_on_wire() {
        // `locArgs` is optional on the TS twin (`locArgs?: string[]`);
        // when empty it must NOT appear on the wire so the TS side never
        // sees an unexpected key.
        let frame = TunnelFrame::Notify(NotifyFrame {
            notify_kind: NotifyKind::Finished,
            loc_args: Vec::new(),
            session_key: "sess-2".into(),
        });
        let s = serde_json::to_string(&frame).unwrap();
        assert!(!s.contains("locArgs"));
        assert!(s.contains("\"notifyKind\":\"finished\""));
    }
}
