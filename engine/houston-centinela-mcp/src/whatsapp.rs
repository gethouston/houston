//! Meta WhatsApp Cloud API client. Credentials are read from the environment so
//! a secret never lands in a committed file (Houston's secrets rule).
//!
//! A business number that is not in the 24h customer window can only send
//! pre-approved **templates**. Set `WHATSAPP_TEMPLATE` (and optionally
//! `WHATSAPP_TEMPLATE_LANG`) to use a template whose body has two variables:
//! {{1}} = agent, {{2}} = capability. Without it, free-form text is used
//! (only valid inside the 24h window).

use serde_json::{json, Value};

pub struct WhatsApp {
    token: String,
    phone_number_id: String,
    recipient: String,
    template: Option<String>,
    language: String,
    client: reqwest::Client,
}

impl WhatsApp {
    /// Build from `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and
    /// `WHATSAPP_RECIPIENT`. Returns `None` (approver disabled) if any is unset.
    /// `WHATSAPP_TEMPLATE` / `WHATSAPP_TEMPLATE_LANG` are optional.
    pub fn from_env() -> Option<Self> {
        Some(Self {
            token: non_empty("WHATSAPP_TOKEN")?,
            phone_number_id: non_empty("WHATSAPP_PHONE_NUMBER_ID")?,
            recipient: non_empty("WHATSAPP_RECIPIENT")?,
            template: non_empty("WHATSAPP_TEMPLATE"),
            language: non_empty("WHATSAPP_TEMPLATE_LANG").unwrap_or_else(|| "es".to_string()),
            client: reqwest::Client::new(),
        })
    }

    /// Send the approval request: a template ({{1}}=agent, {{2}}=capability) when
    /// `WHATSAPP_TEMPLATE` is configured, otherwise free-form text.
    pub async fn send_approval(&self, agent: &str, capability: &str) -> Result<(), String> {
        match &self.template {
            Some(name) => self.send_template(name, &[agent, capability]).await,
            None => {
                let body = format!(
                    "El agente {agent} quiere solicitar permiso para {capability}. Responde SI o NO."
                );
                self.send(json!({
                    "messaging_product": "whatsapp",
                    "to": self.recipient,
                    "type": "text",
                    "text": { "body": body }
                }))
                .await
            }
        }
    }

    async fn send_template(&self, name: &str, params: &[&str]) -> Result<(), String> {
        let parameters: Vec<Value> = params
            .iter()
            .map(|p| json!({ "type": "text", "text": p }))
            .collect();
        self.send(json!({
            "messaging_product": "whatsapp",
            "to": self.recipient,
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

fn non_empty(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}
