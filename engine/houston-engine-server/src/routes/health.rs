//! `/v1/health` and `/v1/version`.

use axum::Json;
use houston_engine_protocol::{HealthResponse, VersionResponse, ENGINE_VERSION, PROTOCOL_VERSION};

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: ENGINE_VERSION,
        protocol: PROTOCOL_VERSION,
    })
}

pub async fn version() -> Json<VersionResponse> {
    Json(VersionResponse {
        engine: ENGINE_VERSION,
        protocol: PROTOCOL_VERSION,
        build: option_env!("HOUSTON_BUILD").map(str::to_string),
    })
}
