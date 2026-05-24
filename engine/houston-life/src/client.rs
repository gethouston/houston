//! UDS-backed gRPC client to a local `lifed` daemon.

use std::path::PathBuf;

use hyper_util::rt::TokioIo;
use tokio::net::UnixStream;
use tonic::transport::{Channel, Endpoint, Uri};
use tower::service_fn;

use crate::error::{LifeError, LifeResult};
use crate::proto::life::v1::{
    agent_client::AgentClient, events_client::EventsClient, identity_client::IdentityClient,
    wallet_client::WalletClient,
};

/// Client to a `lifed` daemon over a Unix Domain Socket.
///
/// Stage 0 entry point: connects to the locally-running `lifed` (e.g.
/// `/tmp/life/life.sock` for the dev config, `/run/life/life.sock` for
/// production systemd deployments) and exposes the four public services.
/// Auth is the `Bearer dev-token-for-{user_id}` shortcut when `lifed`
/// is run with `auth.dev_signer_enabled = true`.
#[derive(Clone)]
pub struct LifeClient {
    channel: Channel,
    auth_token: String,
}

impl LifeClient {
    /// Connect to `lifed` over a Unix Domain Socket.
    ///
    /// `path` is the public-plane UDS path (`life.sock`). `auth_token`
    /// is the bearer credential — typically `dev-token-for-{user_id}`
    /// in development, or a real Tier-1 JWT in production-equivalent
    /// setups.
    pub async fn connect_uds(
        path: impl Into<PathBuf>,
        auth_token: impl Into<String>,
    ) -> LifeResult<Self> {
        let path = path.into();
        // The URI is a placeholder — the custom connector ignores it
        // and dials the UDS path instead.
        let channel = Endpoint::from_static("http://[::]:50051")
            .connect_with_connector(service_fn(move |_: Uri| {
                let path = path.clone();
                async move {
                    let stream = UnixStream::connect(&path).await?;
                    Ok::<_, std::io::Error>(TokioIo::new(stream))
                }
            }))
            .await?;
        Ok(Self {
            channel,
            auth_token: auth_token.into(),
        })
    }

    /// Wrap a request body in a `tonic::Request` and attach the bearer
    /// auth header in the `authorization` metadata key.
    pub fn authed_request<T>(&self, body: T) -> LifeResult<tonic::Request<T>> {
        let mut req = tonic::Request::new(body);
        let value = format!("Bearer {}", self.auth_token).parse().map_err(
            |e: tonic::metadata::errors::InvalidMetadataValue| LifeError::Auth(e.to_string()),
        )?;
        req.metadata_mut().insert("authorization", value);
        Ok(req)
    }

    /// `life.v1.Agent` service stub.
    pub fn agent(&self) -> AgentClient<Channel> {
        AgentClient::new(self.channel.clone())
    }

    /// `life.v1.Events` service stub.
    pub fn events(&self) -> EventsClient<Channel> {
        EventsClient::new(self.channel.clone())
    }

    /// `life.v1.Wallet` service stub.
    pub fn wallet(&self) -> WalletClient<Channel> {
        WalletClient::new(self.channel.clone())
    }

    /// `life.v1.Identity` service stub.
    pub fn identity(&self) -> IdentityClient<Channel> {
        IdentityClient::new(self.channel.clone())
    }
}
