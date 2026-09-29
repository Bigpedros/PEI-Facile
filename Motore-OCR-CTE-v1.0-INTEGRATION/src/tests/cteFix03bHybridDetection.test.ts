import { describe, it, expect } from 'vitest';
import {
  extractGeometricRegions,
  classifyRegionWithHeuristics,
  detectUnresolvedPotentialLabels,
  runHybridDetectionPipeline,
  normalizeLineCandidate,
} from '../core/canonical-template-engine/geometry/hybridDetectionEngine';
import type { RawLineCandidate, RawRectCandidate, RawTextItem } from '../core/fieldCandidateClustering';

describe('PEI FACILE — CTE-FIX-03B Hybrid Geometric + Heuristic Field Detection Suite', () => {
  const pageWidthPt = 595.32;
  const pageHeightPt = 841.92;

  it('1. Enforces WHITE SPACE IS NOT A FIELD: label with white space alone creates NO field', () => {
    const pageNumber = 1;
    const textItems: RawTextItem[] = [
      { x: 50, yTop: 100, w: 80, h: 14, str: 'BAMBINO/A:' },
      { x: 50, yTop: 150, w: 60, h: 14, str: 'Sezione:' },
      { x: 50, yTop: 200, w: 50, h: 14, str: 'Plesso:' },
    ];

    // No physical lines or rects!
    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects: [],
      textItems,
    });

    // Authoritative fields MUST be 0 because white space alone is not a field
    expect(result.authoritativeFields.length).toBe(0);

    // Unresolved potential labels MUST be registered for diagnostics
    expect(result.unresolvedPotentialLabels.length).toBe(3);
    expect(result.unresolvedPotentialLabels[0].reason).toBe('NO_PHYSICAL_GEOMETRY');
    expect(result.unresolvedPotentialLabels[0].label).toBe('BAMBINO/A:');
  });

  it('2. Closed cell empty: creates EMPTY_CELL field even if UNASSOCIATED', () => {
    const pageNumber = 1;
    const rawRects: RawRectCandidate[] = [
      { x: 100, y: 200, w: 250, h: 30, isCheckbox: false },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems: [], // completely empty
    });

    expect(result.authoritativeFields.length).toBe(1);
    const emptyCellField = result.authoritativeFields[0];

    expect(emptyCellField.derivationMethod).toBe('TABLE_CELL');
    expect(emptyCellField.geometrySource).toBe('EMPTY_CELL');
    expect(emptyCellField.labelAssociationMethod).toBe('UNASSOCIATED');
    expect(emptyCellField.semanticKey).toBeNull();
    expect(emptyCellField.geometricConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it('3. Closed cell header: title/header inside closed cell produces NO field', () => {
    const pageNumber = 1;
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 50, w: 500, h: 25, isCheckbox: false },
    ];
    const textItems: RawTextItem[] = [
      { x: 60, yTop: 55, w: 200, h: 14, str: 'SEZIONE 1 — DATI GENERALI' },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
    });

    // HEADER_CELL produces no editable field geometry
    expect(result.authoritativeFields.length).toBe(0);
    expect(result.diagnostics.headerCellsCount).toBe(1);
  });

  it('4. PARTIAL CELL: calculates inset compilable bbox from static text right edge for any prompt ("1.", "a)", "Nome:")', () => {
    const pageNumber = 1;
    const rawRects: RawRectCandidate[] = [
      { x: 100, y: 300, w: 400, h: 35, isCheckbox: false },
    ];
    const textItems: RawTextItem[] = [
      { x: 105, yTop: 305, w: 20, h: 14, str: '1.' },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
    });

    expect(result.authoritativeFields.length).toBe(1);
    const partialField = result.authoritativeFields[0];

    expect(partialField.geometrySource).toBe('PARTIAL_CELL');
    // Static text right edge is 105 + 20 = 125, plus safeGap (4) -> xPt = 129
    expect(partialField.xPt).toBe(129);
    // Right boundary of cell is 500 - safeGap (4) = 496 -> widthPt = 496 - 129 = 367
    expect(partialField.widthPt).toBe(367);
    expect(partialField.labelAssociationMethod).toBe('CONTAINED_PROMPT');
  });

  it('5. UNDERLINE: physical line creates UNDERLINE_FIELD with bbox derived from line', () => {
    const pageNumber = 1;
    const rawLines: RawLineCandidate[] = [
      { x1: 150, y: 220, x2: 450, y2: 220, isVertical: false },
    ];
    const textItems: RawTextItem[] = [
      { x: 50, yTop: 205, w: 90, h: 14, str: 'Cognome:' },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines,
      rawRects: [],
      textItems,
    });

    expect(result.authoritativeFields.length).toBe(1);
    const underlineField = result.authoritativeFields[0];

    expect(underlineField.derivationMethod).toBe('VECTOR_LINE');
    expect(underlineField.geometrySource).toBe('UNDERLINE');
    expect(underlineField.xPt).toBe(150);
    expect(underlineField.widthPt).toBe(300); // 450 - 150
    expect(underlineField.labelAssociationMethod).toBe('LEFT_NEIGHBOR');
  });

  it('6. Two lines without side borders: classified as OPEN_STRUCTURE / STRUCTURAL_ONLY and creates NO field', () => {
    const pageNumber = 1;
    const rawLines: RawLineCandidate[] = [
      { x1: 100, y: 400, x2: 500 },
      { x1: 100, y: 450, x2: 500 },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines,
      rawRects: [], // no vertical side borders!
      textItems: [],
    });

    expect(result.authoritativeFields.length).toBe(0);
    expect(result.diagnostics.structuralOnlyCount).toBeGreaterThanOrEqual(1);
  });

  it('7. CHECKBOX & NON_FILLABLE_GRAPHIC discrimination', () => {
    const pageNumber = 1;
    const rawRects: RawRectCandidate[] = [
      // Checkbox
      { x: 60, y: 120, w: 14, h: 14, isCheckbox: true },
      // Stamp / Logo circle
      { x: 400, y: 100, w: 60, h: 60, isCheckbox: false, type: 'CIRCLE' } as any,
    ];
    const textItems: RawTextItem[] = [
      { x: 80, yTop: 120, w: 40, h: 12, str: 'Sì' },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
    });

    expect(result.authoritativeFields.length).toBe(1);
    const chkField = result.authoritativeFields[0];
    expect(chkField.fieldType).toBe('SINGLE_CHOICE');
    expect(chkField.derivationMethod).toBe('CHECKBOX_BOX');

    expect(result.diagnostics.nonFillableGraphicsCount).toBe(1);
  });

  it('8. Preserves distinct confidence scores (geometric, heuristic, label, semantic) on fields', () => {
    const pageNumber = 1;
    const rawRects: RawRectCandidate[] = [
      { x: 120, y: 350, w: 200, h: 30, isCheckbox: false },
    ];
    const textItems: RawTextItem[] = [
      { x: 40, yTop: 355, w: 70, h: 14, str: 'Codice Fiscale:' },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
    });

    expect(result.authoritativeFields.length).toBe(1);
    const field = result.authoritativeFields[0];

    expect(field.geometricConfidence).toBeGreaterThanOrEqual(0.85);
    expect(field.heuristicConfidence).toBeGreaterThanOrEqual(0.85);
    expect(field.labelConfidence).toBeGreaterThanOrEqual(0.80);
    expect(field.semanticConfidence).toBeDefined();
    expect(field.labelAssociationMethod).toBe('LEFT_NEIGHBOR');
  });

  it('9. Strictly enforces pageNumber coherence', () => {
    const rawLines: RawLineCandidate[] = [
      { x1: 100, y: 200, x2: 400, y2: 200 },
    ];
    const textItems: RawTextItem[] = [
      { x: 40, yTop: 195, w: 50, h: 14, str: 'Data:' },
    ];

    const result = runHybridDetectionPipeline({
      pageNumber: 3,
      pageWidthPt,
      pageHeightPt,
      rawLines,
      rawRects: [],
      textItems,
    });

    expect(result.authoritativeFields.length).toBe(1);
    expect(result.authoritativeFields[0].pageNumber).toBe(3);
  });
});
