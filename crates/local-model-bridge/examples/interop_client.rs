//! Synthetic cross-language harness. Credentials enter through stdin only.
use houston_local_model_bridge::{connect, BridgeConfig};
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    connect_url: String,
    ticket: String,
    target_base_url: String,
    model: String,
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = BufReader::new(tokio::io::stdin());
    let mut line = String::new();
    input.read_line(&mut line).await?;
    let config: Config = serde_json::from_str(&line)?;
    let mut bridge = connect(
        BridgeConfig {
            connect_url: config.connect_url,
            ticket: config.ticket,
            target_base_url: config.target_base_url,
            model: config.model,
            local_api_key: None,
        },
        |_| {},
    )
    .await?;
    println!("ready");
    let mut discard = [0; 1024];
    while input.read(&mut discard).await? != 0 {}
    bridge.shutdown().await?;
    Ok(())
}
