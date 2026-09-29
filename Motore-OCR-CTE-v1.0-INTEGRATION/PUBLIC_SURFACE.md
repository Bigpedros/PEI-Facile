# Motore OCR-CTE v1.0 — Stable public surface

The v1.0 compatibility promise applies only to the root package exports and the optional `pei-adapter` entry point.

## Root exports

The root package exposes:

- versioned contracts and diagnostics;
- `analyzePage()` and capability/error APIs;
- generic OCR image analysis;
- PDF intake primitives;
- image preprocessing and text reconstruction;
- public geometry/input/output types.

It intentionally does **not** export the historical internal template registries, release-specific CTE orchestration classes, PEI application state, calibrator services, or persistence components.

This keeps the stable integration boundary domain-neutral even though some historical implementation modules remain in the repository for compatibility and internal evolution.

## Optional adapter

`motore-ocr-cte/pei-adapter` supplies PEI-specific semantic vocabulary. It can assign meaning to already observed geometry but cannot create or reposition geometry.

## Compatibility

Breaking changes to root exports require a new public contract major version. Internal implementation files may evolve without being considered public API.
