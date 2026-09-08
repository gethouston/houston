use super::{state, types::*, RunningBridge, BRIDGE, EPOCH, STATUS};
use houston_local_model_bridge::{connect, BridgeConfig, BridgeStatus};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};

pub async fn stop(identity: &Identity) -> Result<(), String> {
    let taken = {
        let mut bridge = BRIDGE.lock().map_err(|_| "Bridge state unavailable")?;
        if bridge
            .as_ref()
            .is_some_and(|running| &running.identity != identity)
        {
            return Ok(());
        }
        EPOCH.fetch_add(1, Ordering::SeqCst);
        bridge.take()
    };
    let result = match taken {
        Some(mut running) => running
            .handle
            .shutdown()
            .await
            .map_err(|error| error.to_string()),
        None => Ok(()),
    };
    let mut status = STATUS.lock().map_err(|_| "Bridge status unavailable")?;
    if status.as_ref().is_some_and(|s| &s.identity == identity) {
        *status = None;
    }
    result
}
pub async fn start(app: AppHandle, args: StartArgs) -> Result<StartResult, String> {
    args.identity.key("journal")?;
    args.validate_connect_origin()?;
    let journal = state::load(&args.identity)
        .await?
        .ok_or("Prepare the bridge before connecting")?;
    let descriptor = journal
        .descriptor
        .ok_or("Register the bridge before connecting")?;
    if descriptor.bridge_id != args.bridge_id
        || journal.input.target_base_url != args.target_base_url
        || journal.input.model != args.model
    {
        return Err("Bridge connection does not match registration".into());
    }
    let local_api_key = state::local_key(
        &args.identity,
        &args.target_base_url,
        &args.model,
        args.local_api_key,
    )
    .await?;
    let old = {
        BRIDGE
            .lock()
            .map_err(|_| "Bridge state unavailable")?
            .take()
    };
    let epoch = EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(mut old) = old {
        old.handle
            .shutdown()
            .await
            .map_err(|error| error.to_string())?;
    }
    *STATUS.lock().map_err(|_| "Bridge status unavailable")? = Some(Status {
        bridge_id: args.bridge_id,
        identity: args.identity.clone(),
        generation: 0,
        status: StatusKind::Connecting,
        session_expires_at: None,
    });
    let identity = args.identity.clone();
    let handle = connect(
        BridgeConfig {
            connect_url: args.connect_url,
            ticket: args.ticket,
            target_base_url: args.target_base_url,
            model: args.model,
            local_api_key,
        },
        move |event| {
            if EPOCH.load(Ordering::SeqCst) != epoch {
                return;
            }
            if let Err(error) = update(&app, &identity, event) {
                tracing::error!("local bridge status: {error}");
            }
        },
    )
    .await
    .map_err(|error| error.to_string())?;
    let result = {
        let status = STATUS.lock().map_err(|_| "Bridge status unavailable")?;
        let current = status.as_ref().ok_or("Bridge closed during connection")?;
        StartResult {
            generation: current.generation,
            session_expires_at: current
                .session_expires_at
                .clone()
                .ok_or("Bridge did not become ready")?,
        }
    };
    let mut running = BRIDGE.lock().map_err(|_| "Bridge state unavailable")?;
    if EPOCH.load(Ordering::SeqCst) != epoch {
        return Err("Bridge connection cancelled".into());
    }
    *running = Some(RunningBridge {
        identity: args.identity,
        handle,
    });
    Ok(result)
}
fn update(app: &AppHandle, identity: &Identity, event: BridgeStatus) -> Result<(), String> {
    let payload = {
        let mut guard = STATUS.lock().map_err(|_| "Bridge status unavailable")?;
        let status = guard.as_mut().ok_or("Bridge status missing")?;
        if &status.identity != identity {
            return Ok(());
        }
        match event {
            BridgeStatus::Online {
                generation,
                session_expires_at,
            } => {
                status.generation = generation;
                status.session_expires_at = Some(session_expires_at);
                status.status = StatusKind::Online;
            }
            BridgeStatus::Renewed { session_expires_at } => {
                status.session_expires_at = Some(session_expires_at);
            }
            BridgeStatus::ModelUnavailable => status.status = StatusKind::ModelUnavailable,
            BridgeStatus::Draining => status.status = StatusKind::Reconnecting,
            BridgeStatus::Offline { error } => {
                if let Some(error) = error {
                    tracing::info!("local bridge disconnected: {error}");
                }
                status.status = StatusKind::Reconnecting;
            }
        }
        status.clone()
    };
    app.emit("local-bridge-status", payload)
        .map_err(|_| "Cannot emit bridge status".into())
}

pub async fn renew(identity: Identity, ticket: String) -> Result<(), String> {
    let (running, epoch) = {
        let mut guard = BRIDGE.lock().map_err(|_| "Bridge state unavailable")?;
        if !guard
            .as_ref()
            .is_some_and(|running| running.identity == identity)
        {
            return Err("Bridge identity is not active".into());
        }
        (
            guard.take().ok_or("Bridge is disconnected")?,
            super::EPOCH.load(std::sync::atomic::Ordering::SeqCst),
        )
    };
    let result = running
        .handle
        .renew(ticket)
        .await
        .map_err(|error| error.to_string());
    let mut slot = BRIDGE.lock().map_err(|_| "Bridge state unavailable")?;
    if super::EPOCH.load(std::sync::atomic::Ordering::SeqCst) != epoch {
        return Err("Bridge renewal cancelled".into());
    }
    *slot = Some(running);
    result
}
