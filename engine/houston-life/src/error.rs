//! Typed errors for the `houston-life` client.

use thiserror::Error;

pub type LifeResult<T> = std::result::Result<T, LifeError>;

#[derive(Debug, Error)]
pub enum LifeError {
    /// Failure constructing the tonic channel (UDS connect failed, TLS
    /// negotiation failed, etc.).
    #[error("transport: {0}")]
    Transport(#[from] tonic::transport::Error),

    /// `lifed` returned a non-OK gRPC status.
    #[error("rpc: {0}")]
    Rpc(#[from] tonic::Status),

    /// Auth header could not be constructed (invalid metadata value).
    #[error("auth: {0}")]
    Auth(String),

    /// Local I/O failure (UDS socket missing, etc.).
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}
