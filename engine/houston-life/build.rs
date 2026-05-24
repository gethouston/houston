//! Compile the vendored `life.v1.*` + `aios.v1.*` protos via `tonic-build`.
//!
//! Protos are vendored under `proto/` (copied verbatim from `core/life/proto/`)
//! so the Houston fork's CI does not need a `core/life` checkout to build.
//! Re-vendor on Life proto changes.

fn main() -> std::io::Result<()> {
    // Vendor `protoc` so the crate compiles in CI / sandbox environments
    // that don't ship protobuf-compiler. `protoc-bin-vendored` bundles a
    // platform-appropriate binary per Cargo target.
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))?;
    std::env::set_var("PROTOC", protoc);

    tonic_prost_build::configure()
        .build_server(false)
        .build_client(true)
        .compile_protos(
            &[
                "proto/aios/v1/identifiers.proto",
                "proto/life/v1/agent.proto",
                "proto/life/v1/events.proto",
                "proto/life/v1/identity.proto",
                "proto/life/v1/wallet.proto",
            ],
            &["proto"],
        )?;
    println!("cargo:rerun-if-changed=proto");
    Ok(())
}
