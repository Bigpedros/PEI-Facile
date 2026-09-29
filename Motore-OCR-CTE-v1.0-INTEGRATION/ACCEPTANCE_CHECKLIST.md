# Motore OCR-CTE v1.0 — Acceptance Checklist

Stable Core acceptance requires all of the following:

- [x] Core is standalone and contains no React/UI dependency.
- [x] Domain semantics are optional adapters.
- [x] Stable root package surface excludes historical domain-shaped CTE registries/orchestrators.
- [x] Generic OCR result schema is domain-neutral (`OCR_CTE_OCR_RESULT_V1`).
- [x] OCR/geometry pipeline is callable headlessly.
- [x] Physical geometry precedes heuristic classification and semantics.
- [x] Whitespace alone cannot create a field.
- [x] Closed cells, underlines and checkboxes are supported physical sources.
- [x] Page ownership and canonical coordinates are explicit.
- [x] Public API and diagnostic schema are versioned 1.0.0.
- [x] Public errors use stable codes.
- [x] Real 12-page Comune di Roma fixture is retained as regression evidence.
- [x] v0.8 real-document regression smoke passes.
- [x] v0.9 contract/API smoke passes.
- [x] v1.0 release smoke passes.
- [x] Core typecheck passes.
- [x] Pipeline typecheck passes.
- [x] Library build passes.
- [ ] Full Vitest suite completes in the extraction environment (blocked by unavailable/local Vitest runtime and `npx vitest` timeout).

The unchecked Vitest item is an environment-execution limitation, not silently treated as PASS. Stable Core is frozen against the explicit smoke/regression suite above; future environments should run the complete Vitest suite before publishing a binary/package release.
