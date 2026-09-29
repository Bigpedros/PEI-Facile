# Motore OCR-CTE v1.0 — Integration Guide

## Core rule

The engine is domain-neutral. Geometry is produced from observable document structure; optional adapters may assign semantics but cannot create or move geometry.

## Minimal integration

```ts
import { analyzePage, getEngineCapabilities } from 'motore-ocr-cte';

const output = analyzePage({
  pageNumber: 1,
  pageWidthPt,
  pageHeightPt,
  image: { width, height, data: rgba },
  geometryMaskTextItems,
  semanticTextItems,
  source: 'my-document.pdf',
});

console.log(output.fields);
```

## Optional PEI adapter

```ts
import { registerPeiAdapter } from 'motore-ocr-cte/pei-adapter';
registerPeiAdapter();
```

The adapter adds PEI-specific semantic resolution and prompt recognition only. It does not own OCR, physical geometry, field placement or persistence.

## Integration responsibilities

The client is responsible for document acquisition, rasterization where required, persistence, UI, user confirmation and domain workflow. The engine is responsible for OCR-related localization primitives, geometric region extraction, heuristic field classification, optional semantic mapping, diagnostics and authoritative `FieldGeometry` output.

## Coordinate contract

All public `FieldGeometry` values use canonical page points with top-left origin. Clients must transform these coordinates only at rendering time; stored geometry should remain in canonical coordinates.

## Error handling

Catch `OcrCteEngineError` and branch on its stable `code`. Do not infer behavior from message strings.
