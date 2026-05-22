.PHONY: help typecheck test check-locales cargo-sync-check verify-all

help:
	@echo "Houston Monorepo Development Commands"
	@echo "======================================"
	@echo "make typecheck        - Run TypeScript typecheck across all workspace packages"
	@echo "make test             - Run all Rust tests in the workspace"
	@echo "make check-locales    - Validate translation files parity and format"
	@echo "make cargo-sync-check - Verify version consistency between package.json and Cargo crates"
	@echo "make verify-all       - Run all validation checks (typecheck, locales, cargo-sync, test)"

typecheck:
	pnpm typecheck

test:
	cargo test --workspace

check-locales:
	pnpm --filter houston-app check-locales

cargo-sync-check:
	./scripts/cargo-sync-check.sh

verify-all: typecheck check-locales cargo-sync-check test
