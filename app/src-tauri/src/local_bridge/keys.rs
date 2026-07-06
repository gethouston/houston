//! High-entropy key generation for the local-bridge auth proxy.

use rand::RngCore;

/// A fresh 256-bit proxy key as a 64-char lowercase-hex string. `rand::rng()`
/// is a CSPRNG seeded from the OS, so the key is unguessable — it's the only
/// credential standing between the public tunnel and the user's local model
/// server.
pub fn generate_proxy_key() -> String {
    let mut buf = [0u8; 32];
    rand::rng().fill_bytes(&mut buf);
    to_hex(&buf)
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_shape_is_64_hex_chars() {
        let key = generate_proxy_key();
        assert_eq!(key.len(), 64, "256 bits → 64 hex chars");
        assert!(
            key.chars().all(|c| c.is_ascii_hexdigit()),
            "key must be all hex: {key}"
        );
    }

    #[test]
    fn keys_are_unique() {
        // A trivial entropy smoke test: fresh keys must differ.
        let a = generate_proxy_key();
        let b = generate_proxy_key();
        assert_ne!(a, b, "two generated keys collided");
    }

    #[test]
    fn to_hex_is_correct() {
        assert_eq!(to_hex(&[0x00, 0x0f, 0xff, 0xa5]), "000fffa5");
    }
}
