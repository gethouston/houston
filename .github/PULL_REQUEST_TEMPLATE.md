<!--
Read CONTRIBUTING.md "Before you open a PR" first. PRs that don't fit get closed.
-->

## What this scratches for you

<!-- Required. A bug you hit, or a feature you'll use in Houston. "Thought it would be nice" is not an answer. -->

## Linked issue

<!-- Required for anything >50 LOC or any new tooling/docs/governance. Bug fixes under 50 LOC can skip. -->

Closes #

## Summary

<!-- 1-3 bullets on what changed. -->

-

## Surface impact

<!-- A UI/UX change must not silently skip a surface. Tick what this PR touches.
     Procedure: knowledge-base/client-architecture.md -->

Change type:

- [ ] Behavior (shared SDK view-model — `packages/sdk`)
- [ ] Look (design tokens — `packages/design-tokens`)
- [ ] Structure (a component added/changed → bump `design/inventory/inventory.yaml` + CHANGELOG + update enforced manifests)
- [ ] n-a (no user-facing surface change)

Surfaces updated:

- [ ] Web / desktop
- [ ] iOS
- [ ] Android

<!-- Structural change? `pnpm check:parity` must pass. See design/inventory/README.md. -->

## Checklist

- [ ] I read the diff myself before opening this PR (AI-assisted is fine, AI-unreviewed is not)
- [ ] I have no other open PRs on this repo
- [ ] `pnpm typecheck` passes
- [ ] `cargo check --workspace` passes (if Rust touched)
- [ ] `cargo test --workspace` passes (if Rust touched)
- [ ] No external frameworks/methodology imported into `knowledge-base/` or `docs/`
