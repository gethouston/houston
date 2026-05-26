//! Permission policy evaluator.
//!
//! Beltic's `agent_authorization` credentials carry a `claims.permissions[]`
//! list of `{resource_type, resource_id?, actions[], conditions[]?}` triples.
//! At transaction time the caller supplies a context map (e.g.,
//! `{"resource_type": "wallet", "action": "checkout", "transaction_amount":
//! 5000, "transaction_currency": "USD"}`) and we evaluate:
//!
//! 1. At least one permission must match the resource_type + action
//! 2. Every condition on at least one matching permission must hold
//!
//! Supported operators: `lte`, `lt`, `gte`, `gt`, `eq`, `neq`, `in`.

use std::cmp::Ordering;

/// Returns `None` on pass, `Some(detail)` on deny. An empty context is treated
/// as "no policy check requested" — useful for callers that want to assert
/// authenticity without making a transaction-level decision.
pub fn evaluate(payload: &serde_json::Value, ctx: &serde_json::Value) -> Option<String> {
    if ctx.as_object().map(|m| m.is_empty()).unwrap_or(true) {
        return None;
    }
    let claims = payload
        .pointer("/vc/credentialSubject/claims")
        .or_else(|| payload.get("claims"))?;
    let perms = claims.get("permissions").and_then(|v| v.as_array())?;
    if perms.is_empty() {
        return None;
    }

    let matches: Vec<&serde_json::Value> =
        perms.iter().filter(|p| permission_matches(p, ctx)).collect();
    if matches.is_empty() {
        return Some("no permission grants this resource/action".into());
    }
    for p in &matches {
        let conds = p
            .get("conditions")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let failures: Vec<String> = conds.iter().filter_map(|c| check_condition(c, ctx)).collect();
        if failures.is_empty() {
            return None;
        }
    }
    Some("conditions denied for all matching permissions".into())
}

fn permission_matches(p: &serde_json::Value, ctx: &serde_json::Value) -> bool {
    let resource_ok = p
        .get("resource_type")
        .and_then(|v| v.as_str())
        .zip(ctx.get("resource_type").and_then(|v| v.as_str()))
        .map(|(a, b)| a == b)
        .unwrap_or(false);
    if !resource_ok {
        return false;
    }
    let actions = p.get("actions").and_then(|v| v.as_array());
    let Some(actions) = actions else { return true };
    let Some(ctx_action) = ctx.get("action").and_then(|v| v.as_str()) else { return true };
    actions.iter().any(|a| a.as_str() == Some(ctx_action))
}

fn check_condition(c: &serde_json::Value, ctx: &serde_json::Value) -> Option<String> {
    let op = c.get("operator").and_then(|v| v.as_str()).unwrap_or("");
    let field = c.get("field").and_then(|v| v.as_str()).unwrap_or("");
    let expected = c.get("value").unwrap_or(&serde_json::Value::Null);
    let actual = ctx.get(field).unwrap_or(&serde_json::Value::Null);
    let ok = match op {
        "lte" => cmp_num(actual, expected).map(|o| o <= Ordering::Equal).unwrap_or(false),
        "lt" => cmp_num(actual, expected).map(|o| o < Ordering::Equal).unwrap_or(false),
        "gte" => cmp_num(actual, expected).map(|o| o >= Ordering::Equal).unwrap_or(false),
        "gt" => cmp_num(actual, expected).map(|o| o > Ordering::Equal).unwrap_or(false),
        "eq" => actual == expected,
        "neq" => actual != expected,
        "in" => expected.as_array().map(|arr| arr.contains(actual)).unwrap_or(false),
        _ => false,
    };
    if ok {
        None
    } else {
        Some(format!("{field} {op} {expected} (was {actual})"))
    }
}

fn cmp_num(a: &serde_json::Value, b: &serde_json::Value) -> Option<Ordering> {
    let af = a.as_f64()?;
    let bf = b.as_f64()?;
    af.partial_cmp(&bf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_ctx_passes() {
        let payload = json!({"vc":{"credentialSubject":{"claims":{"permissions":[
            {"resource_type":"wallet","actions":["checkout"]}
        ]}}}});
        assert!(evaluate(&payload, &json!({})).is_none());
    }

    #[test]
    fn unmatched_resource_denies() {
        let payload = json!({"vc":{"credentialSubject":{"claims":{"permissions":[
            {"resource_type":"wallet","actions":["checkout"]}
        ]}}}});
        let ctx = json!({"resource_type":"calendar","action":"read"});
        let r = evaluate(&payload, &ctx).expect("should deny");
        assert!(r.contains("no permission"));
    }

    #[test]
    fn passes_with_satisfied_conditions() {
        let payload = json!({"vc":{"credentialSubject":{"claims":{"permissions":[{
            "resource_type":"wallet","actions":["checkout"],
            "conditions":[{"operator":"lte","field":"transaction_amount","value":10000}]
        }]}}}});
        let ctx = json!({"resource_type":"wallet","action":"checkout","transaction_amount":5000});
        assert!(evaluate(&payload, &ctx).is_none());
    }

    #[test]
    fn denies_when_condition_fails() {
        let payload = json!({"vc":{"credentialSubject":{"claims":{"permissions":[{
            "resource_type":"wallet","actions":["checkout"],
            "conditions":[{"operator":"lte","field":"transaction_amount","value":100}]
        }]}}}});
        let ctx = json!({"resource_type":"wallet","action":"checkout","transaction_amount":999});
        assert!(evaluate(&payload, &ctx).is_some());
    }

    #[test]
    fn in_operator_matches_currency() {
        let payload = json!({"vc":{"credentialSubject":{"claims":{"permissions":[{
            "resource_type":"wallet","actions":["checkout"],
            "conditions":[{"operator":"in","field":"transaction_currency","value":["USD","BRL"]}]
        }]}}}});
        let pass = json!({"resource_type":"wallet","action":"checkout","transaction_currency":"USD"});
        let fail = json!({"resource_type":"wallet","action":"checkout","transaction_currency":"EUR"});
        assert!(evaluate(&payload, &pass).is_none());
        assert!(evaluate(&payload, &fail).is_some());
    }

    #[test]
    fn unknown_operator_denies() {
        let payload = json!({"vc":{"credentialSubject":{"claims":{"permissions":[{
            "resource_type":"wallet","actions":["checkout"],
            "conditions":[{"operator":"bogus","field":"x","value":1}]
        }]}}}});
        let ctx = json!({"resource_type":"wallet","action":"checkout","x":1});
        assert!(evaluate(&payload, &ctx).is_some());
    }
}
