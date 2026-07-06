//! URL helpers for the local bridge — reducing a caller's base URL to the
//! `scheme://host[:port]` origin the auth proxy forwards against.

/// Reduce a base URL to its `scheme://host[:port]` origin (drop any path), which
/// is what the proxy forwards against.
pub fn origin_of(base: &str) -> Result<String, String> {
    let base = base.trim();
    let scheme_end = base
        .find("://")
        .ok_or_else(|| format!("targetBaseUrl {base:?} is missing a scheme"))?;
    let authority_start = scheme_end + 3;
    let rest = &base[authority_start..];
    let authority_len = rest.find('/').unwrap_or(rest.len());
    if authority_len == 0 {
        return Err(format!("targetBaseUrl {base:?} has no host"));
    }
    Ok(format!(
        "{}{}",
        &base[..authority_start],
        &rest[..authority_len]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_strips_path() {
        assert_eq!(
            origin_of("http://127.0.0.1:1234/v1").unwrap(),
            "http://127.0.0.1:1234"
        );
        assert_eq!(
            origin_of("http://127.0.0.1:1234").unwrap(),
            "http://127.0.0.1:1234"
        );
        assert_eq!(
            origin_of("https://host:8443/a/b/c").unwrap(),
            "https://host:8443"
        );
    }

    #[test]
    fn origin_rejects_bad_input() {
        assert!(origin_of("127.0.0.1:1234").is_err()); // no scheme
        assert!(origin_of("http:///v1").is_err()); // no host
    }
}
