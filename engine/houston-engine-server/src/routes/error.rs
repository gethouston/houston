//! Map `CoreError` to HTTP status + `ErrorBody`.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use houston_engine_core::CoreError;
use houston_engine_protocol::{ErrorBody, ErrorCode, ErrorDetail};

#[derive(Debug)]
pub struct ApiError(pub CoreError);

impl From<CoreError> for ApiError {
    fn from(e: CoreError) -> Self {
        Self(e)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let code = self.0.code();
        let status = match code {
            ErrorCode::NotFound => StatusCode::NOT_FOUND,
            ErrorCode::Conflict => StatusCode::CONFLICT,
            ErrorCode::BadRequest => StatusCode::BAD_REQUEST,
            ErrorCode::Unauthorized => StatusCode::UNAUTHORIZED,
            ErrorCode::Forbidden => StatusCode::FORBIDDEN,
            ErrorCode::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::VersionMismatch => StatusCode::CONFLICT,
            ErrorCode::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let details = self
            .0
            .kind()
            .map(|kind| serde_json::json!({ "kind": kind }));
        (
            status,
            Json(ErrorBody {
                error: ErrorDetail {
                    code,
                    message: self.0.to_string(),
                    details,
                },
            }),
        )
            .into_response()
    }
}
