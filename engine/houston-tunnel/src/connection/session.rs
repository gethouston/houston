use super::{is_auth_failure, now_ms, RunError, TunnelClient, HEARTBEAT_EVERY, WATCHDOG_SILENCE};
use crate::frame::{PingFrame, PongFrame, TunnelFrame};
use crate::proxy::LegsMap;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message as WsMsg;

impl TunnelClient {
    pub(super) async fn run_once(
        &self,
        outbound_rx: &mut tokio::sync::mpsc::Receiver<TunnelFrame>,
    ) -> Result<(), RunError> {
        use tokio_tungstenite::tungstenite::client::IntoClientRequest;
        use tokio_tungstenite::tungstenite::http::HeaderValue;

        let (register_url, tunnel_token, endpoint, runtime) = {
            let guard = self.cfg.lock().await;
            let Some(url) = self.register_url_for(&guard) else {
                return Err(RunError::Other(anyhow::anyhow!("bad tunnel_url scheme")));
            };
            (
                url,
                guard.identity.tunnel_token.clone(),
                guard.endpoint.clone(),
                guard.runtime.clone(),
            )
        };

        let mut request = register_url
            .as_str()
            .into_client_request()
            .map_err(|e| RunError::Other(e.into()))?;
        request.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {tunnel_token}"))
                .map_err(|e| RunError::Other(e.into()))?,
        );

        let (stream, _resp) = match tokio_tungstenite::connect_async(request).await {
            Ok(x) => x,
            Err(e) => {
                if is_auth_failure(&e) {
                    return Err(RunError::Unauthorized);
                }
                return Err(RunError::Other(e.into()));
            }
        };
        tracing::info!(target: "houston_tunnel", "tunnel connected");
        runtime.mark_connected();

        let (mut sink, mut src) = stream.split();
        let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<TunnelFrame>();
        let legs: LegsMap = Arc::new(Mutex::new(HashMap::new()));

        let writer = tokio::spawn(async move {
            while let Some(frame) = out_rx.recv().await {
                let text = match serde_json::to_string(&frame) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!(target: "houston_tunnel", error = %e, "serialize frame");
                        continue;
                    }
                };
                if let Err(e) = sink.send(WsMsg::Text(text.into())).await {
                    tracing::debug!(target: "houston_tunnel", error = %e, "writer closed");
                    break;
                }
            }
        });

        let http = reqwest::Client::builder()
            .tcp_nodelay(true)
            .build()
            .map_err(|e| RunError::Other(e.into()))?;

        let last_recv_ms = AtomicI64::new(now_ms());
        let mut heartbeat = tokio::time::interval(HEARTBEAT_EVERY);
        heartbeat.tick().await;

        let outcome: Result<(), RunError> = loop {
            tokio::select! {
                biased;
                maybe_msg = src.next() => {
                    let Some(msg) = maybe_msg else { break Ok(()); };
                    let msg = match msg {
                        Ok(m) => m,
                        Err(e) => break Err(RunError::Other(e.into())),
                    };
                    last_recv_ms.store(now_ms(), Ordering::Relaxed);
                    runtime.mark_activity();
                    let text = match msg {
                        WsMsg::Text(t) => t.to_string(),
                        WsMsg::Ping(_) => {
                            self.send_frame(&out_tx, TunnelFrame::Pong(PongFrame { ts: now_ms() }));
                            continue;
                        }
                        WsMsg::Close(_) => break Ok(()),
                        _ => continue,
                    };
                    let frame: TunnelFrame = match serde_json::from_str(&text) {
                        Ok(f) => f,
                        Err(_) => continue,
                    };
                    self.dispatch(frame, &out_tx, &legs, &http, &endpoint).await;
                }
                maybe_outbound = outbound_rx.recv() => {
                    match maybe_outbound {
                        Some(frame) => {
                            // Forward the producer-side frame into the
                            // writer task's inner channel. `send_frame`
                            // logs + drops on writer-disconnect (the
                            // writer is per-`run_once`, so a writer
                            // drop here means the connection is gone;
                            // the next loop iteration will detect via
                            // `src.next()` returning None or the
                            // watchdog firing).
                            //
                            // Backpressure note: the inner writer
                            // channel is unbounded (shared with every
                            // other frame type — HttpResponse, Pong,
                            // PairResponse — that uses the same
                            // writer-task indirection). The bounded
                            // `OUTBOUND_CHANNEL_CAPACITY` enforces
                            // backpressure on the *producer* side
                            // (the engine-server notify dispatcher);
                            // a sustained slow WSS sink would let the
                            // inner unbounded queue grow until the
                            // watchdog (`WATCHDOG_SILENCE`, 90s) fires
                            // and the connection is torn down. For
                            // the only current producer
                            // (notify_dispatcher) this is safe because
                            // `NotifyPolicy` caps emissions to ~5/day,
                            // so per-connection burst is bounded. A
                            // future producer with higher cadence would
                            // need to either (a) tighten the inner
                            // channel to bounded, or (b) bypass the
                            // writer task and write inline. Both are
                            // wider refactors and out of scope here.
                            self.send_frame(&out_tx, frame);
                        }
                        None => {
                            // The persistent producer side (the
                            // `outbound_tx` field on `TunnelClient`)
                            // has been dropped — only happens when the
                            // engine is shutting down. Exit cleanly so
                            // the outer reconnect loop doesn't spin.
                            tracing::info!(
                                target: "houston_tunnel",
                                "outbound channel closed; run_once exiting"
                            );
                            break Ok(());
                        }
                    }
                }
                _ = heartbeat.tick() => {
                    let silence_ms = now_ms() - last_recv_ms.load(Ordering::Relaxed);
                    if silence_ms > WATCHDOG_SILENCE.as_millis() as i64 {
                        tracing::warn!(
                            target: "houston_tunnel",
                            silence_ms,
                            "tunnel watchdog fired — no frame received in window, forcing reconnect"
                        );
                        break Err(RunError::Other(anyhow::anyhow!(
                            "watchdog: no frame in {}ms",
                            silence_ms
                        )));
                    }
                    self.send_frame(&out_tx, TunnelFrame::Ping(PingFrame { ts: now_ms() }));
                }
            }
        };

        drop(out_tx);
        if let Err(e) = writer.await {
            tracing::debug!(target: "houston_tunnel", error = %e, "writer task join failed");
        }
        outcome
    }
}
