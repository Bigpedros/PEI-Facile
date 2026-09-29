import { describe, it, expect } from 'vitest';
import {
  extractCellInteriorRect,
  normalizeLineCandidate,
  clusterAndRefineCandidates,
  type RawLineCandidate,
  type RawRectCandidate,
  type RawTextItem,
} from '../core/fieldCandidateClustering';
import type { FieldGeometry } from '../data/geometry/types';

describe('PEI FACILE — CTE-FIX-03A Geometric Field Extraction Suite', () => {
  it('1. Generates FieldGeometry with padding inset from vector/raster cell rectangle', () => {
    const box = { x: 50, y: 100, w: 200, h: 40 };
    const interior = extractCellInteriorRect(box, null, 2);

    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.xPt).toBe(52); // 50 + 2 inset
    expect(interior.yPt).toBe(102); // 100 + 2 inset
    expect(interior.widthPt).toBe(196); // 200 - 4
    expect(interior.heightPt).toBe(36); // 40 - 4
  });

  it('2. Tolerates non-perfectly horizontal or vertical lines by calculating meanCoordinate', () => {
    // Slanted horizontal line: y goes from 500 to 504 over x = 200 to 900
    const slantedLine: RawLineCandidate = {
      x1: 200,
      y: 500,
      x2: 900,
      y2: 504,
      isVertical: false,
    };

    const normalized = normalizeLineCandidate(slantedLine);

    expect(normalized.normalizedOrientation).toBe('HORIZONTAL');
    expect(normalized.meanCoordinate).toBe(502); // (500 + 504) / 2
    expect(normalized.y).toBe(502);
  });

  it('3. Recognizes empty cells as fillable field candidates associated with adjacent labels', () => {
    const pageNumber = 1;
    const pageWidthPt = 595.32;
    const pageHeightPt = 841.92;

    const rawRects: RawRectCandidate[] = [
      { x: 150, y: 100, w: 300, h: 30, isCheckbox: false },
    ];

    const textItems: RawTextItem[] = [
      { x: 40, yTop: 105, w: 100, h: 14, str: 'Data di nascita:' },
    ];

    const result = clusterAndRefineCandidates({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(result.proposedFields.length).toBeGreaterThanOrEqual(1);
    const emptyCellField = result.proposedFields.find((f) => f.anchorText.includes('Data di nascita'));
    expect(emptyCellField).toBeDefined();
    expect(emptyCellField?.xPt).toBe(152); // 150 + 2 inset
    expect(emptyCellField?.widthPt).toBe(296); // 300 - 4 inset
  });

  it('4. Correctly associates labels from left neighbor and top header', () => {
    const pageNumber = 1;
    const pageWidthPt = 595.32;
    const pageHeightPt = 841.92;

    const rawRects: RawRectCandidate[] = [
      // Cell 1 with left label
      { x: 150, y: 100, w: 200, h: 25, isCheckbox: false },
      // Cell 2 with top header
      { x: 150, y: 200, w: 200, h: 40, isCheckbox: false },
    ];

    const textItems: RawTextItem[] = [
      { x: 40, yTop: 105, w: 100, h: 14, str: 'Sezione:' },
      { x: 150, yTop: 180, w: 120, h: 14, str: 'Note generali:' },
    ];

    const result = clusterAndRefineCandidates({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    const leftField = result.proposedFields.find((f) => f.anchorText.includes('Sezione'));
    const topField = result.proposedFields.find((f) => f.anchorText.includes('Note generali'));

    expect(leftField).toBeDefined();
    expect(leftField?.labelAssociationMethod).toBe('LEFT_NEIGHBOR');

    expect(topField).toBeDefined();
    expect(topField?.labelAssociationMethod).toBe('TOP_HEADER');
  });

  it('5. Preserves geometric metadata (derivationMethod, geometricConfidence, rawGeometricBBox, labelAssociationMethod)', () => {
    const pageNumber = 1;
    const pageWidthPt = 595.32;
    const pageHeightPt = 841.92;

    const rawRects: RawRectCandidate[] = [
      { x: 100, y: 300, w: 250, h: 35, isCheckbox: false },
    ];

    const textItems: RawTextItem[] = [
      { x: 105, yTop: 305, w: 80, h: 12, str: 'Codice Fiscale:' },
    ];

    const result = clusterAndRefineCandidates({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(result.proposedFields.length).toBe(1);
    const field = result.proposedFields[0];

    expect(field.derivationMethod).toBe('TABLE_CELL');
    expect(field.geometricConfidence).toBeGreaterThan(0.8);
    expect(field.rawGeometricBBox).toEqual({
      left: 100,
      top: 300,
      right: 350,
      bottom: 335,
    });
    expect(field.labelAssociationMethod).toBe('CONTAINED_PROMPT');
  });
});
