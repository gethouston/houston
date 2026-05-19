//! Offline binary: read the enriched catalog, embed each toolkit's
//! representative text with MultilingualE5Small, write
//! `data/catalog-embeddings.bin` for `include_bytes!` to pick up.
//!
//! Run from the workspace root (NOT the worktree's `app/` dir):
//!
//! ```text
//! cargo run --release -p houston-composio --bin precompute_embeddings
//! ```
//!
//! First run downloads the model (~120MB) to `~/.cache/fastembed/`.
//! Subsequent runs are local-only. Typical wall time on a laptop:
//! ~2-3 minutes for 1000 toolkits with batched embedding.

use houston_composio::recommender::embeddings::embed_passages;
use houston_composio::recommender::embedding_store::serialize;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Catalog {
    toolkits: Vec<Toolkit>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Toolkit {
    slug: String,
    name: String,
    #[serde(default)]
    one_liner: String,
    #[serde(default)]
    use_cases: Vec<String>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    primary_category: String,
}

const BATCH_SIZE: usize = 32;

fn main() {
    let crate_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let input = crate_root.join("data/catalog-enriched.json");
    let output = crate_root.join("data/catalog-embeddings.bin");

    let raw = std::fs::read_to_string(&input).unwrap_or_else(|e| {
        eprintln!("failed to read {}: {e}", input.display());
        std::process::exit(1);
    });
    let catalog: Catalog = serde_json::from_str(&raw).unwrap_or_else(|e| {
        eprintln!("invalid catalog-enriched.json: {e}");
        std::process::exit(1);
    });

    let total = catalog.toolkits.len();
    println!("Embedding {} toolkits with MultilingualE5Small (384-dim)…", total);
    println!("(first run downloads ~120MB model to ~/.cache/fastembed/)");

    let mut entries: Vec<(String, Vec<f32>)> = Vec::with_capacity(total);
    let mut batch_passages: Vec<String> = Vec::with_capacity(BATCH_SIZE);
    let mut batch_slugs: Vec<String> = Vec::with_capacity(BATCH_SIZE);
    let mut processed = 0usize;

    for tk in &catalog.toolkits {
        batch_passages.push(toolkit_passage(tk));
        batch_slugs.push(tk.slug.clone());
        if batch_passages.len() >= BATCH_SIZE {
            flush_batch(&mut batch_passages, &mut batch_slugs, &mut entries);
            processed += BATCH_SIZE;
            println!("  embedded {processed}/{total}");
        }
    }
    if !batch_passages.is_empty() {
        let n = batch_passages.len();
        flush_batch(&mut batch_passages, &mut batch_slugs, &mut entries);
        processed += n;
        println!("  embedded {processed}/{total}");
    }

    let bytes = serialize(&entries);
    std::fs::write(&output, &bytes).unwrap_or_else(|e| {
        eprintln!("failed to write {}: {e}", output.display());
        std::process::exit(1);
    });

    println!(
        "Wrote {} entries → {} ({} bytes)",
        entries.len(),
        output.display(),
        bytes.len()
    );
}

/// The text we hand to the embedder for each toolkit. We concatenate
/// the densest signals first (name, oneLiner, useCases) and keywords
/// last. Keywords are critical for typo recall — they often include
/// short colloquial forms ("prs", "facturar") that the more formal
/// oneLiner won't contain.
fn toolkit_passage(t: &Toolkit) -> String {
    let mut parts = Vec::with_capacity(5);
    parts.push(t.name.clone());
    if !t.one_liner.is_empty() {
        parts.push(t.one_liner.clone());
    }
    if !t.use_cases.is_empty() {
        parts.push(t.use_cases.join(". "));
    }
    if !t.primary_category.is_empty() {
        parts.push(t.primary_category.replace('-', " "));
    }
    if !t.keywords.is_empty() {
        parts.push(t.keywords.join(" "));
    }
    parts.join(". ")
}

fn flush_batch(
    passages: &mut Vec<String>,
    slugs: &mut Vec<String>,
    out: &mut Vec<(String, Vec<f32>)>,
) {
    let vectors = embed_passages(passages).unwrap_or_else(|e| {
        eprintln!("embed_passages failed: {e}");
        std::process::exit(1);
    });
    for (slug, vec) in slugs.drain(..).zip(vectors.into_iter()) {
        out.push((slug, vec));
    }
    passages.clear();
}
