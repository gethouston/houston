use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) const CHUNK: usize = 65536;
pub(crate) const WINDOW: usize = 262144;
pub(crate) const BODY: usize = 16777216;
pub(crate) const MESSAGE: usize = 98304;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Incoming {
    #[serde(rename_all = "camelCase")]
    Ready {
        version: u8,
        generation: u64,
        session_expires_at: String,
    },
    #[serde(rename_all = "camelCase")]
    RequestStart {
        request_id: Uuid,
        operation: Operation,
        model: String,
    },
    #[serde(rename_all = "camelCase")]
    RequestChunk {
        request_id: Uuid,
        sequence: u64,
        data: String,
    },
    #[serde(rename_all = "camelCase")]
    RequestEnd {
        request_id: Uuid,
    },
    #[serde(rename_all = "camelCase")]
    Cancel {
        request_id: Uuid,
    },
    #[serde(rename_all = "camelCase")]
    Window {
        request_id: Uuid,
        direction: ResponseDirection,
        bytes: usize,
    },
    #[serde(rename_all = "camelCase")]
    Renewed {
        session_expires_at: String,
    },
    Drain,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Operation {
    Models,
    Chat,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ResponseDirection {
    Response,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum Outgoing {
    #[serde(rename_all = "camelCase")]
    ResponseStart {
        request_id: Uuid,
        status: u16,
        #[serde(skip_serializing_if = "Option::is_none")]
        content_type: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ResponseChunk {
        request_id: Uuid,
        sequence: u64,
        data: String,
    },
    #[serde(rename_all = "camelCase")]
    ResponseEnd {
        request_id: Uuid,
    },
    #[serde(rename_all = "camelCase")]
    ResponseError {
        request_id: Uuid,
        code: &'static str,
    },
    #[serde(rename_all = "camelCase")]
    Window {
        request_id: Uuid,
        direction: &'static str,
        bytes: usize,
    },
    Renew {
        ticket: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_trust_boundary_rejects_extra_fields_and_wrong_directions() {
        let id = Uuid::new_v4();
        for value in [
            serde_json::json!({"type":"cancel","requestId":id,"url":"http://evil"}),
            serde_json::json!({"type":"window","requestId":id,"direction":"request","bytes":1}),
            serde_json::json!({"type":"request_start","requestId":id,"operation":"delete","model":"x"}),
            serde_json::json!({"type":"cancel","requestId":"not-a-uuid"}),
        ] {
            assert!(serde_json::from_value::<Incoming>(value).is_err());
        }
    }
}
