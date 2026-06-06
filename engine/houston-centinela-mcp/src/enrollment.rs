//! Number enrollment by one-time code: proves the owner controls the WhatsApp
//! number before it can become the approval trust anchor.
//!
//! Without this, anyone could set any number as the approver and the whole
//! step-up channel is bypassable: an attacker points it at their own phone and
//! self-approves. So a number is only accepted after a code we sent to it is
//! echoed back, and the verified anchor lives here, server-side, where the
//! agent can never reach or change it.

use rand::Rng;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long an unconfirmed code stays valid.
const CODE_TTL: Duration = Duration::from_secs(300);

struct Pending {
    code: String,
    expires: Instant,
}

/// Holds the verified approval number plus any in-flight enrollment codes.
#[derive(Default)]
pub struct Enrollment {
    pending: Mutex<HashMap<String, Pending>>,
    verified: Mutex<Option<String>>,
}

impl Enrollment {
    /// `seed` pre-verifies a number the trusted operator set out of band (the
    /// `WHATSAPP_RECIPIENT` env). UI enrollment can replace it after an OTP.
    pub fn new(seed: Option<String>) -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            verified: Mutex::new(seed),
        }
    }

    /// Begin enrollment for `number` with a freshly generated code. The caller
    /// delivers the returned code to that number out of band (WhatsApp).
    pub fn start(&self, number: &str) -> String {
        let code = random_code();
        self.pending.lock().unwrap().insert(
            number.to_string(),
            Pending {
                code: code.clone(),
                expires: Instant::now() + CODE_TTL,
            },
        );
        code
    }

    /// Confirm `number` with `code`. On success it becomes the verified anchor
    /// and the code is consumed (single use).
    pub fn confirm(&self, number: &str, code: &str) -> bool {
        let mut pending = self.pending.lock().unwrap();
        let ok =
            matches!(pending.get(number), Some(p) if p.expires > Instant::now() && p.code == code);
        if ok {
            pending.remove(number);
            *self.verified.lock().unwrap() = Some(number.to_string());
        }
        ok
    }

    /// The verified trust anchor, if a number has been verified.
    pub fn verified(&self) -> Option<String> {
        self.verified.lock().unwrap().clone()
    }
}

/// A six-digit numeric code.
pub fn random_code() -> String {
    let n: u32 = rand::thread_rng().gen_range(0..1_000_000);
    format!("{n:06}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_code_verifies_and_sets_anchor() {
        let e = Enrollment::new(None);
        assert_eq!(e.verified(), None);
        let code = e.start("573058166527");
        assert!(e.confirm("573058166527", &code));
        assert_eq!(e.verified().as_deref(), Some("573058166527"));
    }

    #[test]
    fn wrong_code_does_not_verify() {
        let e = Enrollment::new(None);
        e.start("573058166527");
        assert!(!e.confirm("573058166527", "000000"));
        assert_eq!(e.verified(), None);
    }

    #[test]
    fn unknown_number_does_not_verify() {
        let e = Enrollment::new(None);
        assert!(!e.confirm("573000000000", "123456"));
    }

    #[test]
    fn code_is_single_use() {
        let e = Enrollment::new(None);
        let code = e.start("573058166527");
        assert!(e.confirm("573058166527", &code));
        // A replayed code finds nothing pending.
        assert!(!e.confirm("573058166527", &code));
    }

    #[test]
    fn seed_pre_verifies_operator_number() {
        let e = Enrollment::new(Some("573058166527".to_string()));
        assert_eq!(e.verified().as_deref(), Some("573058166527"));
    }

    #[test]
    fn random_code_is_six_digits() {
        let c = random_code();
        assert_eq!(c.len(), 6);
        assert!(c.chars().all(|ch| ch.is_ascii_digit()));
    }
}
