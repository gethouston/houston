use crate::{BridgeConfig, BridgeError};
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use url::Url;

pub(crate) struct Target {
    pub client: reqwest::Client,
    pub prefix: String,
    pub model: String,
    pub key: Option<String>,
}
impl Target {
    pub fn new(config: &BridgeConfig) -> Result<Self, BridgeError> {
        let mut url =
            Url::parse(&config.target_base_url).map_err(|_| BridgeError::InvalidTarget)?;
        let host = url.host_str().ok_or(BridgeError::InvalidTarget)?;
        let literal = host.trim_start_matches('[').trim_end_matches(']');
        let loopback = literal.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback());
        if !matches!(url.scheme(), "http" | "https")
            || (!loopback && host != "localhost")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || config.target_base_url.contains('%')
            || config.target_base_url.contains('\\')
            || config.model.is_empty()
            || config
                .target_base_url
                .chars()
                .any(|ch| ch.is_control() || ch.is_whitespace())
            || config.target_base_url.contains("/../")
            || config.target_base_url.contains("/./")
            || config.target_base_url.ends_with("/..")
            || config.target_base_url.ends_with("/.")
            || config.model.len() > 256
        {
            return Err(BridgeError::InvalidTarget);
        }
        // URL parsers normalize noncanonical numeric hosts; require the original authority.
        let authority = config
            .target_base_url
            .split("://")
            .nth(1)
            .and_then(|rest| rest.split('/').next())
            .ok_or(BridgeError::InvalidTarget)?;
        let canonical = match url.port() {
            Some(port) => format!("{host}:{port}"),
            None => host.to_owned(),
        };
        let default_port = match url.scheme() {
            "http" => 80,
            _ => 443,
        };
        if authority != canonical && authority != format!("{canonical}:{default_port}") {
            return Err(BridgeError::InvalidTarget);
        }
        let mut builder = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .connect_timeout(Duration::from_secs(5));
        if host == "localhost" {
            // Pin both resolutions; never consult a mutable DNS/proxy environment.
            let port = url
                .port_or_known_default()
                .ok_or(BridgeError::InvalidTarget)?;
            builder = builder.resolve_to_addrs(
                "localhost",
                &[
                    SocketAddr::from(([127, 0, 0, 1], port)),
                    SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], port)),
                ],
            );
        }
        // Detection and legacy descriptors store an origin, not an API prefix.
        if url.path() == "/" {
            url.set_path("/v1");
        }
        Ok(Self {
            client: builder.build().map_err(|_| BridgeError::InvalidTarget)?,
            prefix: url.as_str().trim_end_matches('/').to_owned(),
            model: config.model.clone(),
            key: config.local_api_key.clone(),
        })
    }
}
