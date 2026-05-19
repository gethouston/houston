//! Precomputed catalog embeddings — load + lookup.
//!
//! Binary layout (little-endian):
//!
//! ```text
//! magic:        4 bytes = "HEMB"
//! version:      4 bytes u32 = 1
//! dim:          4 bytes u32 = 384  (must equal embeddings::EMBEDDING_DIM)
//! count:        4 bytes u32 = number of toolkit entries
//! repeat `count` times:
//!     slug_len: 2 bytes u16
//!     slug:     `slug_len` bytes UTF-8
//!     vector:   `dim` * 4 bytes f32 little-endian
//! ```
//!
//! Built offline by `bin/precompute_embeddings.rs` from the enriched
//! catalog. Embedded into the engine binary via `include_bytes!` so
//! end users never download or recompute anything.

use super::embeddings::EMBEDDING_DIM;
use std::collections::HashMap;

pub const MAGIC: &[u8; 4] = b"HEMB";
pub const FORMAT_VERSION: u32 = 1;

const RAW_EMBEDDINGS: &[u8] =
    include_bytes!("../../data/catalog-embeddings.bin");

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("file too short — possibly missing or truncated")]
    TooShort,
    #[error("invalid magic bytes (got {got:?}, expected HEMB)")]
    BadMagic { got: [u8; 4] },
    #[error("unsupported format version {got} (expected {expected})")]
    BadVersion { got: u32, expected: u32 },
    #[error("dimension mismatch: file declares {file_dim}, build expects {expected}")]
    BadDimension { file_dim: u32, expected: usize },
    #[error("entry header read past end of file at entry {at}")]
    UnexpectedEnd { at: usize },
}

/// In-memory catalog embeddings: slug → 384-dim vector.
#[derive(Debug)]
pub struct EmbeddingStore {
    by_slug: HashMap<String, Vec<f32>>,
}

impl EmbeddingStore {
    /// Loads from the binary file embedded at build time. Returns an
    /// empty store on any parse error (the recommender then transparently
    /// falls back to keyword-only matching). This is the right
    /// behaviour for the V1.5 ship — we never want a corrupt
    /// embeddings file to take the whole recommend route down.
    pub fn from_bundled() -> Self {
        match Self::parse(RAW_EMBEDDINGS) {
            Ok(store) => store,
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "bundled catalog-embeddings.bin failed to load — recommender falls back to keyword-only"
                );
                Self { by_slug: HashMap::new() }
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        self.by_slug.is_empty()
    }

    pub fn len(&self) -> usize {
        self.by_slug.len()
    }

    pub fn get(&self, slug: &str) -> Option<&[f32]> {
        self.by_slug.get(slug).map(|v| v.as_slice())
    }

    /// Test-only constructor used by sibling modules (matcher tests)
    /// to build a populated store from in-memory bytes without going
    /// through the file system or the bundled include_bytes! path.
    #[cfg(test)]
    pub fn from_bytes_for_test(bytes: &[u8]) -> Self {
        Self::parse(bytes).expect("test store bytes must be valid")
    }

    fn parse(bytes: &[u8]) -> Result<Self, LoadError> {
        if bytes.len() < 16 {
            return Err(LoadError::TooShort);
        }
        let mut cursor = 0;

        let mut magic = [0u8; 4];
        magic.copy_from_slice(&bytes[cursor..cursor + 4]);
        cursor += 4;
        if &magic != MAGIC {
            return Err(LoadError::BadMagic { got: magic });
        }

        let version = read_u32(bytes, &mut cursor)?;
        if version != FORMAT_VERSION {
            return Err(LoadError::BadVersion {
                got: version,
                expected: FORMAT_VERSION,
            });
        }

        let dim = read_u32(bytes, &mut cursor)?;
        if dim as usize != EMBEDDING_DIM {
            return Err(LoadError::BadDimension {
                file_dim: dim,
                expected: EMBEDDING_DIM,
            });
        }

        let count = read_u32(bytes, &mut cursor)? as usize;
        let vec_bytes = EMBEDDING_DIM * 4;

        let mut by_slug = HashMap::with_capacity(count);
        for i in 0..count {
            if cursor + 2 > bytes.len() {
                return Err(LoadError::UnexpectedEnd { at: i });
            }
            let slug_len = u16::from_le_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
            cursor += 2;
            if cursor + slug_len + vec_bytes > bytes.len() {
                return Err(LoadError::UnexpectedEnd { at: i });
            }
            let slug = std::str::from_utf8(&bytes[cursor..cursor + slug_len])
                .map_err(|_| LoadError::UnexpectedEnd { at: i })?
                .to_string();
            cursor += slug_len;

            let mut vector = Vec::with_capacity(EMBEDDING_DIM);
            for _ in 0..EMBEDDING_DIM {
                let f = f32::from_le_bytes([
                    bytes[cursor],
                    bytes[cursor + 1],
                    bytes[cursor + 2],
                    bytes[cursor + 3],
                ]);
                cursor += 4;
                vector.push(f);
            }
            by_slug.insert(slug, vector);
        }

        Ok(Self { by_slug })
    }
}

fn read_u32(bytes: &[u8], cursor: &mut usize) -> Result<u32, LoadError> {
    if *cursor + 4 > bytes.len() {
        return Err(LoadError::TooShort);
    }
    let v = u32::from_le_bytes([
        bytes[*cursor],
        bytes[*cursor + 1],
        bytes[*cursor + 2],
        bytes[*cursor + 3],
    ]);
    *cursor += 4;
    Ok(v)
}

/// Write a freshly-built embedding store to bytes in the format
/// described at the top of this file. Used by the offline precompute
/// binary; never called at runtime.
pub fn serialize(entries: &[(String, Vec<f32>)]) -> Vec<u8> {
    let count = entries.len();
    let total = 16 + entries.iter().map(|(s, _)| 2 + s.len() + EMBEDDING_DIM * 4).sum::<usize>();
    let mut out = Vec::with_capacity(total);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
    out.extend_from_slice(&(EMBEDDING_DIM as u32).to_le_bytes());
    out.extend_from_slice(&(count as u32).to_le_bytes());
    for (slug, vec) in entries {
        assert_eq!(vec.len(), EMBEDDING_DIM, "vector length mismatch for {slug}");
        let slug_bytes = slug.as_bytes();
        out.extend_from_slice(&(slug_bytes.len() as u16).to_le_bytes());
        out.extend_from_slice(slug_bytes);
        for f in vec {
            out.extend_from_slice(&f.to_le_bytes());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let v1: Vec<f32> = (0..EMBEDDING_DIM).map(|i| i as f32 / 1000.0).collect();
        let v2: Vec<f32> = (0..EMBEDDING_DIM).map(|i| (i as f32 + 100.0) / 1000.0).collect();
        let entries = vec![
            ("github".to_string(), v1.clone()),
            ("gmail".to_string(), v2.clone()),
        ];

        let bytes = serialize(&entries);
        let store = EmbeddingStore::parse(&bytes).expect("parse");
        assert_eq!(store.len(), 2);
        assert_eq!(store.get("github").unwrap(), v1.as_slice());
        assert_eq!(store.get("gmail").unwrap(), v2.as_slice());
        assert!(store.get("missing").is_none());
    }

    #[test]
    fn bad_magic_rejected() {
        let bytes = vec![b'X'; 64];
        assert!(matches!(
            EmbeddingStore::parse(&bytes),
            Err(LoadError::BadMagic { .. })
        ));
    }

    #[test]
    fn bad_dim_rejected() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&999u32.to_le_bytes()); // wrong dim
        bytes.extend_from_slice(&0u32.to_le_bytes());
        assert!(matches!(
            EmbeddingStore::parse(&bytes),
            Err(LoadError::BadDimension { .. })
        ));
    }
}
