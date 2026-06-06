//! Meta WhatsApp Cloud API client. Implements [`Notifier`]. Credentials are read
//! from the environment so a secret never lands in a committed file.
//!
//! Sends go to an explicit `to`. A business number outside the 24h window can
//! only send pre-approved templates, so `WHATSAPP_TEMPLATE` (approvals),
//! `WHATSAPP_OTP_TEMPLATE` (codes) and `WHATSAPP_ALERT_TEMPLATE` (alerts) select
//! templates; without them, free-form text is used (valid inside the window).

use crate::notifier::Notifier;
use async_trait::async_trait;
use serde_json::{json, Value};

pub struct WhatsApp {
    token: String,
    phone_number_id: String,
    template: Option<String>,
    otp_template: Option<String>,
    alert_template: Option<String>,
    language: String,
    client: reqwest::Client,
}

impl WhatsApp {
    /// Build from `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (both
    /// required). Templates and language are optional.
    pub fn from_env() -> Option<Self> {
        Some(Self {
            token: non_empty("WHATSAPP_TOKEN")?,
            phone_number_id: non_empty("WHATSAPP_PHONE_NUMBER_ID")?,
            template: non_empty("WHATSAPP_TEMPLATE"),
            otp_template: non_empty("WHATSAPP_OTP_TEMPLATE"),
            alert_template: non_empty("WHATSAPP_ALERT_TEMPLATE"),
            language: non_empty("WHATSAPP_TEMPLATE_LANG").unwrap_or_else(|| "es".to_string()),
            client: reqwest::Client::new(),
        })
    }

    async fn send_text(&self, to: &str, body: &str) -> Result<(), String> {
        self.send(json!({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": { "body": body }
        }))
        .await
    }

    async fn send_template(&self, to: &str, name: &str, params: &[&str]) -> Result<(), String> {
        let parameters: Vec<Value> = params
            .iter()
            .map(|p| json!({ "type": "text", "text": p }))
            .collect();
        self.send(json!({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": name,
                "language": { "code": self.language },
                "components": [ { "type": "body", "parameters": parameters } ]
            }
        }))
        .await
    }

    async fn send(&self, payload: Value) -> Result<(), String> {
        let url = format!(
            "https://graph.facebook.com/v21.0/{}/messages",
            self.phone_number_id
        );
        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.token)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("error de red enviando WhatsApp: {e}"))?;
        let status = resp.status();
        if status.is_success() {
            Ok(())
        } else {
            let detail = resp.text().await.unwrap_or_else(|_| "<sin cuerpo>".into());
            Err(format!("WhatsApp respondio {status}: {detail}"))
        }
    }
}

#[async_trait]
impl Notifier for WhatsApp {
    async fn send_approval(&self, to: &str, agent: &str, capability: &str) -> Result<(), String> {
        match &self.template {
            Some(name) => self.send_template(to, name, &[agent, capability]).await,
            None => {
                let body = format!(
                    "El agente {agent} quiere solicitar permiso para {capability}. Responde SI o NO."
                );
                self.send_text(to, &body).await
            }
        }
    }

    async fn send_otp(&self, to: &str, code: &str) -> Result<(), String> {
        match &self.otp_template {
            Some(name) => self.send_template(to, name, &[code]).await,
            None => {
                let body =
                    format!("Tu codigo de verificacion de Centinela es {code}. No lo compartas.");
                self.send_text(to, &body).await
            }
        }
    }

    async fn send_alert(
        &self,
        to: &str,
        agent: &str,
        capability: &str,
        reason: &str,
    ) -> Result<(), String> {
        match &self.alert_template {
            Some(name) => {
                self.send_template(to, name, &[agent, capability, reason])
                    .await
            }
            None => {
                let body = format!(
                    "Centinela bloqueo un intento de seguridad. El agente {agent} intento '{capability}': {reason}. Si no fuiste tu, revisa tu cuenta."
                );
                self.send_text(to, &body).await
            }
        }
    }
}

fn non_empty(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}
