//! Local embedding model loader + intent embedding.
//!
//! Wraps `fastembed::TextEmbedding` so the rest of the recommender
//! never has to think about ONNX runtime. We use `MultilingualE5Small`
//! (intfloat/multilingual-e5-small): 384-dim vectors, ~120MB on disk,
//! solid quality across en/es/pt — the three languages Houston ships.
//!
//! Loading is lazy + cached for the engine process lifetime. The first
//! call pays a one-time cost (model load from `~/.cache/fastembed/`,
//! ~500ms cold); subsequent calls are ~5-15ms per intent.
//!
//! E5 models REQUIRE a `query:` / `passage:` prefix to work correctly.
//! We always pass intents as `query:` and catalog entries (computed
//! offline) as `passage:` — mixing the two without the prefix degrades
//! similarity scores noticeably.

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use std::sync::{Mutex, OnceLock};

/// Output dimension of MultilingualE5Small. Hardcoded to keep loading
/// the embeddings.bin trivially fast and panic-on-corruption (rather
/// than silently producing garbage if the model ever changes).
pub const EMBEDDING_DIM: usize = 384;

static MODEL: OnceLock<Mutex<TextEmbedding>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum EmbedError {
    #[error("failed to initialize embedding model: {0}")]
    Init(String),
    #[error("failed to embed text: {0}")]
    Embed(String),
    #[error("model returned wrong dimension: expected {expected}, got {got}")]
    DimensionMismatch { expected: usize, got: usize },
}

/// Lazily initialize the model. Returns a handle wrapped in a Mutex so
/// callers can serialize access — `TextEmbedding::embed` is not
/// `Sync` for batched calls in older fastembed versions, and even
/// when it is, we don't expect enough QPS in the recommender hot path
/// to justify a pool.
fn get_model() -> Result<&'static Mutex<TextEmbedding>, EmbedError> {
    if let Some(m) = MODEL.get() {
        return Ok(m);
    }
    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::MultilingualE5Small).with_show_download_progress(false),
    )
    .map_err(|e| EmbedError::Init(e.to_string()))?;
    let _ = MODEL.set(Mutex::new(model));
    Ok(MODEL.get().expect("just set"))
}

/// Embed a single query intent string. Always uses the `query:` prefix
/// required by the E5 family.
pub fn embed_query(intent: &str) -> Result<Vec<f32>, EmbedError> {
    let prefixed = format!("query: {}", intent.trim());
    let model = get_model()?;
    let mut guard = model.lock().map_err(|e| EmbedError::Embed(e.to_string()))?;
    let batch = guard
        .embed(vec![prefixed], None)
        .map_err(|e| EmbedError::Embed(e.to_string()))?;
    let first = batch
        .into_iter()
        .next()
        .ok_or_else(|| EmbedError::Embed("empty result".into()))?;
    if first.len() != EMBEDDING_DIM {
        return Err(EmbedError::DimensionMismatch {
            expected: EMBEDDING_DIM,
            got: first.len(),
        });
    }
    Ok(first)
}

/// Embed a batch of catalog passages. Used ONLY by the offline
/// precompute binary. Each input gets the `passage:` prefix required
/// by E5 for catalog-side text.
pub fn embed_passages(passages: &[String]) -> Result<Vec<Vec<f32>>, EmbedError> {
    let prefixed: Vec<String> = passages.iter().map(|s| format!("passage: {}", s.trim())).collect();
    let model = get_model()?;
    let mut guard = model.lock().map_err(|e| EmbedError::Embed(e.to_string()))?;
    let result = guard
        .embed(prefixed, None)
        .map_err(|e| EmbedError::Embed(e.to_string()))?;
    for v in &result {
        if v.len() != EMBEDDING_DIM {
            return Err(EmbedError::DimensionMismatch {
                expected: EMBEDDING_DIM,
                got: v.len(),
            });
        }
    }
    Ok(result)
}

/// Cosine similarity between two equal-length vectors. Returns 0.0 if
/// either is the zero vector. Caller guarantees both have length
/// `EMBEDDING_DIM` (panics on mismatch — that's a bug, not a runtime
/// condition).
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "cosine dim mismatch");
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_identical_is_one() {
        let v = vec![0.3f32, -0.5, 0.8, 0.1];
        assert!((cosine(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn cosine_orthogonal_is_zero() {
        let a = vec![1.0f32, 0.0];
        let b = vec![0.0f32, 1.0];
        assert!(cosine(&a, &b).abs() < 1e-5);
    }

    #[test]
    fn cosine_zero_vector_is_zero() {
        let a = vec![0.0f32; 4];
        let b = vec![1.0f32, 2.0, 3.0, 4.0];
        assert_eq!(cosine(&a, &b), 0.0);
    }
}
