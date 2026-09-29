# Extraction map — v1.0 Stable Core

## Core engine

- `src/core/ocrEngine.ts`
- `src/core/pdfIntakeService.ts`
- `src/core/rasterPrimitiveDetector.ts`
- `src/core/textReconstruction.ts`
- `src/core/headlessPageAnalyzer.ts`
- `src/core/fieldCandidateClustering.ts`
- `src/core/canonical-template-engine/**`
- `src/data/geometry/**`

## Frozen public boundary (v1.0)

- `src/core/engineApi.ts`
- `src/contracts/version.ts`
- `src/contracts/errors.ts`
- `src/contracts/diagnostics.ts`
- `src/contracts/publicApi.ts`
- `API_CONTRACT.md`

## Optional domain adapters

- `src/adapters/pei/**`

These adapters may assign semantic meaning and domain prompt vocabulary. They must not create or reposition physical field geometry.

## Node/system adapter

- `src/node/systemPdfAnalyzer.ts`

This is optional infrastructure requiring external `pdfinfo`, `pdftoppm`, and `tesseract` binaries. It is not part of the browser-safe core contract.

## Excluded application concerns

The extracted project contains no React UI, calibrator workspace, PEI compiler screen, IndexedDB application state, model-selection UI, or Google AI Studio deployment code.


## Stable public package surface

See `PUBLIC_SURFACE.md`. Historical domain-shaped registry/orchestration internals are intentionally not exported from the package root.
