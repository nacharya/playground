// pgctl/build.rs
// ===============
// Cargo build script — runs before compilation.
// tonic-build generates Rust gRPC stubs from the shared proto file.
//
// How it works:
//   1. `cargo build` invokes build.rs first
//   2. tonic-build calls protoc to compile playground.proto
//   3. Generated stubs are written to OUT_DIR (e.g. target/debug/build/pgctl-*/out/)
//   4. `include!` macro in grpc_server.rs pulls them in at compile time
//
// Requirements:
//   - protoc must be installed: brew install protobuf  OR  apt install protobuf-compiler
//   - tonic-build in [build-dependencies] (not [dependencies])

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_path = "../proto/playground.proto";
    let proto_dir = "../proto";

    // Check if proto file exists before trying to compile
    // This lets the project build even without the proto file (graceful degradation)
    if !std::path::Path::new(proto_path).exists() {
        println!("cargo:warning=proto/playground.proto not found — skipping gRPC stub generation");
        println!("cargo:warning=Run from repo root: make proto");
        return Ok(());
    }

    // tonic_build::compile_protos generates:
    //   - {service_name}_client.rs   — for making gRPC calls (client side)
    //   - {service_name}_server.rs   — for implementing gRPC services (server side)
    //
    // Options:
    //   .build_server(true)  — generate server traits
    //   .build_client(true)  — generate client stubs
    //   .out_dir(path)       — custom output dir (default: OUT_DIR)
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile(&[proto_path], &[proto_dir])?;

    // Tell cargo to re-run this script if the proto file changes
    println!("cargo:rerun-if-changed={}", proto_path);

    Ok(())
}
