# Motore OCR-CTE v1.0 — Stable Core

Standalone, domain-neutral OCR / geometry / heuristic / CTE engine extracted from PEI FACILE and stabilized as an independent core.

## Stable pipeline

`PDF/Image -> OCR -> physical primitives -> geometric regions -> heuristic classification -> optional client semantics -> authoritative FieldGeometry`

The engine does not know what a PEI, receipt, invoice, fine or deed is. Domain-specific meaning is supplied through optional adapters and cannot control physical geometry.

## Public API

Primary page API:

```ts
analyzePage(input: AnalyzePageInput): AnalyzePageOutput
```

Stable output:
- `fields: FieldGeometry[]`
- `unresolvedPotentialLabels`
- versioned read-only diagnostics
- optional detailed classification trace

See `API_CONTRACT.md` and `INTEGRATION_GUIDE.md`.

## Stable Core guarantees

- no React/UI dependency in the core;
- headless raster pipeline;
- geometry-first field detection;
- whitespace alone never creates fields;
- closed cells, underlines and checkboxes are supported physical field sources;
- canonical top-left page coordinates;
- page ownership explicit;
- normalized public errors;
- independent engine, contract and diagnostic schema versions;
- optional semantic adapters only;
- real-document regression fixture across 12 pages.

## Real regression fixture

`fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf`

v1.0 preserves the validated v0.8/v0.9 real-document baseline. Release freeze intentionally avoids detector retuning.

## Verification gates

Verified in the extraction environment:

```bash
npx tsc -p tsconfig.corecheck.json
npx tsc -p tsconfig.pipeline.cjs.json
npx tsc -p tsconfig.build.json
node tools/v08RegressionSmoke.cjs
node tools/v09ContractSmoke.cjs
node tools/v10ApiSmoke.mjs
node tools/v10ReleaseSmoke.cjs
```

The complete Vitest suite remains a documented external release gate. This extracted workspace has no local `node_modules`; `npx vitest` did not complete within the execution timeout, so no full-suite PASS is claimed.

## Release documents

- `API_CONTRACT.md`
- `INTEGRATION_GUIDE.md`
- `ACCEPTANCE_CHECKLIST.md`
- `RELEASE_NOTES.md`
- `REAL_DOCUMENT_CHECKPOINT.md`

## Integration

PEI FACILE should now consume this engine as a client through an adapter. Further OCR/geometry development belongs here, not inside the PEI FACILE application layer.
