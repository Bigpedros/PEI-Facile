# Motore OCR-CTE v1.0.0 — Stable Core

## Status

Stable integration boundary frozen.

## What is frozen

- `analyzePage()` public page-analysis contract.
- `FieldGeometry` as authoritative geometry output.
- Canonical top-left page coordinate convention.
- Domain-neutral geometry/heuristic core.
- Optional semantic adapter boundary.
- Structured diagnostics and normalized error codes.

## Real-document baseline

The 12-page reconstructed Comune di Roma Infanzia PEI remains the principal regression fixture. v1.0 intentionally preserves the v0.8/v0.9 field-detection baseline rather than retuning geometry during release freeze.

## Compatibility

The contract version is `1.0.0`. Additive optional fields may be introduced in compatible releases. Breaking changes require a new contract major version.

## Known release limitation

The complete Vitest suite did not finish in the extraction environment: the workspace has no local `node_modules`, and `npx vitest` exceeded the available execution timeout. Core/pipeline typechecks, library build, real-document regression smoke, contract/API smoke and release smoke are the verified release gates.

## Public-surface cleanup

The root package now exposes only the stable domain-neutral API. Historical template-registry/orchestration internals remain in source for implementation compatibility but are not part of the v1.0 public contract. The generic OCR result schema is `OCR_CTE_OCR_RESULT_V1`.
