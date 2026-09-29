# Motore OCR-CTE — Public API Contract v1.0.0

This document freezes the integration boundary prepared in engine v0.9.

## Architectural invariant

`PDF/Image -> OCR -> physical primitives -> geometric regions -> heuristic classification -> optional client semantics -> authoritative FieldGeometry`

The core does not know what a PEI, receipt, invoice, fine or deed is. Domain semantics are registered by an optional adapter.

## Primary page API

```ts
analyzePage(input: AnalyzePageInput): AnalyzePageOutput
```

Required input:
- `pageNumber` — 1-based page ownership.
- `pageWidthPt`, `pageHeightPt` — canonical page dimensions.
- `image` — RGBA raster.

Optional input:
- `geometryMaskTextItems` — OCR word boxes used only to mask text during primitive extraction.
- `semanticTextItems` — reconstructed text used for label association and semantic adapters.
- `source` — opaque source descriptor for diagnostics.
- `includeDetailedResults` — omit heavy classification trace when false.

Stable output:
- `fields: FieldGeometry[]` — authoritative editable geometry.
- `unresolvedPotentialLabels` — labels for which no valid physical geometry exists.
- `diagnostics` — versioned diagnostic envelope.
- `results` — optional detailed heuristic trace.

## Error contract

All public engine errors are normalized to `OcrCteEngineError` with a stable `code` and structured `details`.

Codes:
- `INVALID_INPUT`
- `UNSUPPORTED_INPUT`
- `PDF_TOOL_UNAVAILABLE`
- `OCR_TOOL_UNAVAILABLE`
- `RASTERIZATION_FAILED`
- `OCR_FAILED`
- `GEOMETRY_FAILED`
- `SEMANTIC_ADAPTER_FAILED`
- `INTERNAL_ERROR`

## Diagnostic contract

Diagnostics declare:
- diagnostic `schemaVersion`;
- public `contractVersion`;
- engine name/version;
- page geometry;
- primitive counts;
- hybrid counts;
- authoritative fields;
- unresolved potential labels;
- optional detailed results.

Diagnostics are observational. They must not mutate state or persistence.

## FieldGeometry rules

A public `FieldGeometry` must:
- belong to one page;
- have positive width/height;
- use top-left canonical page coordinates;
- originate from observable physical geometry;
- preserve separate geometric / heuristic / label / semantic confidence where available;
- never be created from whitespace alone.

## Adapters

Client adapters may configure:
- semantic resolver;
- prompt keyword matcher.

Adapters may assign meaning. They must not move or create physical geometry.

## Compatibility policy

- Patch/minor releases may add optional fields.
- Breaking renames/removals require a new contract major version.
- Diagnostic schema and engine version are independent so diagnostics can evolve without silently changing the integration contract.


## Stable package surface

The v1.0 compatibility promise applies to the documented root exports. Historical internal CTE registries/orchestrators are implementation details and are intentionally not re-exported from the package root. See `PUBLIC_SURFACE.md`.
