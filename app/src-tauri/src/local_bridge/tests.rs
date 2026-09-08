use super::{state, types::*};
fn identity(agent: &str) -> Identity {
    Identity {
        environment: "https://cloud.gethouston.ai".into(),
        user_id: "user".into(),
        org_id: "org".into(),
        agent_id: agent.into(),
    }
}
#[test]
fn device_shared_across_agents_but_journals_are_fenced() {
    let a = identity("a");
    let b = identity("b");
    assert_eq!(a.key("device").unwrap(), b.key("device").unwrap());
    assert_ne!(a.key("journal").unwrap(), b.key("journal").unwrap());
    let mut foreign = a.clone();
    foreign.user_id = "foreign".into();
    assert_ne!(a.key("device").unwrap(), foreign.key("device").unwrap());
}
#[test]
fn journal_rejects_identity_swap_and_plaintext_credentials() {
    let input = serde_json::json!({"version":1,"identity":identity("a"),"idempotencyKey":uuid::Uuid::new_v4(),"phase":"prepared",
        "input":{"targetBaseUrl":"http://127.0.0.1:1234/v1","model":"selected"}});
    let journal: Journal = serde_json::from_value(input.clone()).unwrap();
    assert!(state::validate(&identity("a"), &journal).is_ok());
    assert!(state::validate(&identity("b"), &journal).is_err());
    let mut secret = input;
    secret["input"]["localApiKey"] = "secret".into();
    assert!(serde_json::from_value::<Journal>(secret).is_err());
}
#[test]
fn registration_is_required_after_preparation() {
    let journal: Journal = serde_json::from_value(serde_json::json!({"version":1,"identity":identity("a"),"idempotencyKey":uuid::Uuid::new_v4(),"phase":"committed",
        "input":{"targetBaseUrl":"http://127.0.0.1:1234/v1","model":"selected"}})).unwrap();
    assert!(state::validate(&identity("a"), &journal).is_err());
}
#[test]
fn minimal_journal_roundtrip_omits_optional_fields() {
    let input = serde_json::json!({"version":1,"identity":identity("a"),"idempotencyKey":uuid::Uuid::new_v4(),"phase":"prepared",
        "input":{"targetBaseUrl":"http://127.0.0.1:1234/v1","model":"selected"}});
    let journal: Journal = serde_json::from_value(input.clone()).unwrap();
    assert_eq!(serde_json::to_value(journal).unwrap(), input);
}
