//! The whisper-cli argument line: language-hint validation and the flag set
//! that keeps stdout to the bare transcript.

use std::path::Path;

/// Validate the language hint against the supported set; anything missing or
/// unrecognized falls through to whisper's autodetect.
pub(super) fn normalize_lang(raw: Option<&str>) -> &'static str {
    match raw.map(str::trim) {
        Some("en") => "en",
        Some("es") => "es",
        Some("pt") => "pt",
        _ => "auto",
    }
}

/// `-nt` (no timestamps) + `-np` (no progress prints) keep stdout to the bare
/// transcript; no `-o*` flags means whisper writes no output files.
pub(super) fn build_args(model: &Path, wav: &Path, lang: &str, threads: usize) -> Vec<String> {
    vec![
        "-m".into(),
        model.to_string_lossy().into_owned(),
        "-f".into(),
        wav.to_string_lossy().into_owned(),
        "-l".into(),
        lang.into(),
        "-t".into(),
        threads.to_string(),
        "-nt".into(),
        "-np".into(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lang_hint_maps_supported_langs() {
        assert_eq!(normalize_lang(Some("en")), "en");
        assert_eq!(normalize_lang(Some("es")), "es");
        assert_eq!(normalize_lang(Some("pt")), "pt");
        assert_eq!(normalize_lang(Some("auto")), "auto");
    }

    #[test]
    fn lang_hint_defaults_to_auto() {
        assert_eq!(normalize_lang(None), "auto");
        assert_eq!(normalize_lang(Some("fr")), "auto");
        assert_eq!(normalize_lang(Some("")), "auto");
    }

    #[test]
    fn args_carry_model_wav_lang_threads_and_flags() {
        let args = build_args(Path::new("/m/model.bin"), Path::new("/t/clip.wav"), "es", 4);
        assert_eq!(
            args,
            vec![
                "-m",
                "/m/model.bin",
                "-f",
                "/t/clip.wav",
                "-l",
                "es",
                "-t",
                "4",
                "-nt",
                "-np",
            ]
        );
    }
}
