# Makefile for pgctl Rust project

PROGRAM := pgctl

debug ?=
ifdef debug
  release :=
  target :=debug
  extension :=debug
else
  release :=--release
  target :=release
  extension :=exec
endif

ARTIFACT=pgctl
CARGO_ENV=. $(HOME)/.cargo/env;

check: check-format check-lint build

format:
	$(CARGO_ENV) cargo fmt --all

check-format:
	$(CARGO_ENV) cargo fmt --all -- --check

check-lint:
	$(CARGO_ENV) cargo clippy -- -D warnings

build:
	$(CARGO_ENV) cargo build $(release)

run:
	rm -rf ~/.config/pgctl
	$(CARGO_ENV) RUST_LOG=debug cargo run $(release) config -i
	$(CARGO_ENV) RUST_LOG=debug cargo run $(release) server -u

test:
	$(CARGO_ENV) cargo test --verbose $(release)

clean:
	rm -rf $(ARTIFACT)
	$(CARGO_ENV) cargo clean
	rm *.lock

docs:
	$(CARGO_ENV) cargo doc --document-private-items

update:
	$(CARGO_ENV) rustup update
