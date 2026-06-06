//! Content inspection: scan an outbound payload for secrets that must never
//! leave, even through a permitted action. This is the data-leak layer on top
//! of the capability gate: the agent may be allowed to send email, but an email
//! that carries an API key, a private key, a card number or a password is a
//! leak, not a legitimate send.

use regex::Regex;
use std::fmt;
use std::sync::OnceLock;

/// What kind of secret an inspected payload appears to carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretKind {
    ApiKey,
    AwsKey,
    PrivateKey,
    Jwt,
    BankCard,
    Password,
}

impl fmt::Display for SecretKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            SecretKind::ApiKey => "una clave de API",
            SecretKind::AwsKey => "una clave de AWS",
            SecretKind::PrivateKey => "una llave privada",
            SecretKind::Jwt => "un token de sesion",
            SecretKind::BankCard => "un numero de tarjeta",
            SecretKind::Password => "una contraseña",
        };
        write!(f, "{s}")
    }
}

struct Rules {
    private_key: Regex,
    aws: Regex,
    jwt: Regex,
    api: Regex,
    card: Regex,
    password: Regex,
}

fn rules() -> &'static Rules {
    static R: OnceLock<Rules> = OnceLock::new();
    R.get_or_init(|| Rules {
        private_key: re(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
        aws: re(r"AKIA[0-9A-Z]{16}"),
        jwt: re(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}"),
        api: re(r"(?i)(sk-[A-Za-z0-9_-]{20,}|(?:api[_-]?key|secret|token|access[_-]?key)\s*[:=]\s*[A-Za-z0-9_\-]{16,})"),
        card: re(r"\b(?:\d[ -]?){13,19}\b"),
        password: re(r"(?i)(password|contraseña|contrasena|clave)\s*[:=]\s*\S{4,}"),
    })
}

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("centinela secret pattern is a compile-time constant")
}

/// Scan `text`. Returns the first secret kind found, or `None`. Order runs from
/// the most specific (private key) to the least (a loose password assignment).
pub fn scan(text: &str) -> Option<SecretKind> {
    let r = rules();
    if r.private_key.is_match(text) {
        return Some(SecretKind::PrivateKey);
    }
    if r.aws.is_match(text) {
        return Some(SecretKind::AwsKey);
    }
    if r.jwt.is_match(text) {
        return Some(SecretKind::Jwt);
    }
    if r.api.is_match(text) {
        return Some(SecretKind::ApiKey);
    }
    if let Some(m) = r.card.find(text) {
        if luhn_ok(m.as_str()) {
            return Some(SecretKind::BankCard);
        }
    }
    if r.password.is_match(text) {
        return Some(SecretKind::Password);
    }
    None
}

/// Luhn check over the digits of `candidate` (spaces and dashes ignored).
fn luhn_ok(candidate: &str) -> bool {
    let digits: Vec<u32> = candidate.chars().filter_map(|c| c.to_digit(10)).collect();
    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }
    let mut sum = 0;
    let mut double = false;
    for &d in digits.iter().rev() {
        let mut v = d;
        if double {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
        double = !double;
    }
    sum % 10 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_openai_style_api_key() {
        assert_eq!(
            scan("la clave es sk-proj-AbCdEf012345abcdef67890"),
            Some(SecretKind::ApiKey)
        );
    }

    #[test]
    fn detects_api_key_assignment() {
        assert_eq!(
            scan("API_KEY=ABCDEFGHIJKLMNOP1234"),
            Some(SecretKind::ApiKey)
        );
    }

    #[test]
    fn detects_aws_access_key() {
        assert_eq!(
            scan("usa AKIAIOSFODNN7EXAMPLE para el bucket"),
            Some(SecretKind::AwsKey)
        );
    }

    #[test]
    fn detects_private_key_block() {
        assert_eq!(
            scan("-----BEGIN RSA PRIVATE KEY-----\nMIIE..."),
            Some(SecretKind::PrivateKey)
        );
    }

    #[test]
    fn detects_jwt() {
        let jwt = "eyJhbGciOiJIUzI1Ni1234.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4";
        assert_eq!(scan(jwt), Some(SecretKind::Jwt));
    }

    #[test]
    fn detects_valid_card_via_luhn() {
        // 4111 1111 1111 1111 is the canonical Visa test number (passes Luhn).
        assert_eq!(
            scan("paga con 4111 1111 1111 1111"),
            Some(SecretKind::BankCard)
        );
    }

    #[test]
    fn ignores_long_number_that_fails_luhn() {
        assert_eq!(scan("referencia 1234567890123456"), None);
    }

    #[test]
    fn detects_password_assignment() {
        assert_eq!(
            scan("contraseña: hunter2-secreta"),
            Some(SecretKind::Password)
        );
    }

    #[test]
    fn clean_text_has_no_secret() {
        assert_eq!(
            scan("Hola jefe, aqui esta el reporte semanal. Saludos."),
            None
        );
    }
}
