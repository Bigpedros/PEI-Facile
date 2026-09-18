import { describe, it, expect } from 'vitest';
import {
  calculateFitScale,
  calculateFitWidthScale,
  snapFieldToDetectedStructure,
  validateFieldGeometry,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  pdfRectToOverlayRect,
  overlayRectToPdfRect,
} from '../data/geometry/geometryTransform';
import {
  clusterAndRefineCandidates,
  type RawLineCandidate,
  type RawRectCandidate,
} from '../core/fieldCandidateClustering';

describe('R08-R5: Final Box Geometry, Page Fit & Structure Alignment', () => {
  describe('Page Fit & Zoom Calculations', () => {
    it('calculates fit scale correctly for standard A4 portrait within available container', () => {
      // Container of 800 x 1000 px, A4 is 595.28 x 841.89 pt
      const scale = calculateFitScale(800, 1000, A4_WIDTH_PT, A4_HEIGHT_PT, 32);
      expect(scale).toBeGreaterThan(0.25);
      expect(scale).toBeLessThanOrEqual(1.5);

      // (1000 - 32) / 841.89 = 968 / 841.89 ≈ 1.15
      expect(scale).toBeCloseTo(1.15, 1);
    });

    it('clamps fit scale to minimum 25% (0.25) when viewport is tiny', () => {
      const scale = calculateFitScale(100, 100, A4_WIDTH_PT, A4_HEIGHT_PT, 16);
      expect(scale).toBe(0.25);
    });

    it('calculates fit width scale correctly', () => {
      // Container width 1200 px
      const scale = calculateFitWidthScale(1200, A4_WIDTH_PT, 32);
      // (1200 - 32) / 595.28 = 1168 / 595.28 ≈ 1.96
      expect(scale).toBeCloseTo(1.96, 1);
    });

    it('calculates fit scale properly for Landscape orientation (e.g. 841.89 x 595.28)', () => {
      const landscapeWidth = A4_HEIGHT_PT;
      const landscapeHeight = A4_WIDTH_PT;
      const scale = calculateFitScale(1000, 700, landscapeWidth, landscapeHeight, 32);
      // (1000 - 32) / 841.89 ≈ 1.15; (700 - 32) / 595.28 ≈ 1.12 -> min is 1.12
      expect(scale).toBeCloseTo(1.12, 1);
    });

    it('guarantees Zoom Invariance: PDF coordinates remain strictly identical under different viewport scales', () => {
      const canonicalBox = { xPt: 72, yPt: 150, widthPt: 300, heightPt: 24 };

      const scales = [0.25, 0.5, 0.85, 1.0, 1.4, 2.0];
      for (const s of scales) {
        const overlay = pdfRectToOverlayRect(canonicalBox, s);
        const backToPdf = overlayRectToPdfRect(overlay, s);

        expect(backToPdf.xPt).toBeCloseTo(canonicalBox.xPt, 4);
        expect(backToPdf.yPt).toBeCloseTo(canonicalBox.yPt, 4);
        expect(backToPdf.widthPt).toBeCloseTo(canonicalBox.widthPt, 4);
        expect(backToPdf.heightPt).toBeCloseTo(canonicalBox.heightPt, 4);
      }
    });
  });

  describe('snapFieldToDetectedStructure', () => {
    it('snaps candidate box to nearby detected rectangle within ±6 pt tolerance', () => {
      const field = {
        fieldId: 'f1',
        xPt: 51.5,
        yPt: 102.3,
        widthPt: 297.0,
        heightPt: 58.2,
      };

      const rects = [
        { x: 50, y: 100, w: 300, h: 60 },
      ];
      const lines: Array<{ x1: number; y: number; x2: number }> = [];

      const snapped = snapFieldToDetectedStructure(field, lines, rects, 6);

      expect(snapped.xPt).toBe(50);
      expect(snapped.yPt).toBe(100);
      expect(snapped.widthPt).toBe(300);
      expect(snapped.heightPt).toBe(60);
    });

    it('snaps bottom of candidate box to nearby detected baseline line', () => {
      const field = {
        fieldId: 'f2',
        xPt: 70,
        yPt: 200,
        widthPt: 200,
        heightPt: 22, // bottom = 222
      };

      const lines = [
        { x1: 68, y: 220, x2: 272 }, // line at y=220 (diff 2 pt from 222)
      ];

      const snapped = snapFieldToDetectedStructure(field, lines, [], 6);

      // bottom snaps to 220, xPt snaps to 68, width snaps to (272 - 68) = 204
      expect(snapped.xPt).toBe(68);
      expect(snapped.widthPt).toBe(204);
      expect(snapped.yPt + snapped.heightPt).toBe(220);
    });

    it('does NOT snap when distance exceeds tolerance', () => {
      const field = {
        fieldId: 'f3',
        xPt: 100,
        yPt: 300,
        widthPt: 150,
        heightPt: 20,
      };

      const rects = [
        { x: 120, y: 320, w: 200, h: 40 }, // distance 20 pt > tolerance 6 pt
      ];

      const snapped = snapFieldToDetectedStructure(field, [], rects, 6);

      expect(snapped.xPt).toBe(100);
      expect(snapped.yPt).toBe(300);
      expect(snapped.widthPt).toBe(150);
      expect(snapped.heightPt).toBe(20);
    });
  });

  describe('validateFieldGeometry', () => {
    it('accepts well-formed text fields within page bounds', () => {
      const validField = {
        xPt: 50,
        yPt: 100,
        widthPt: 250,
        heightPt: 20,
        fieldType: 'TEXT_SHORT',
      };
      const result = validateFieldGeometry(validField, A4_WIDTH_PT, A4_HEIGHT_PT);
      expect(result.isValid).toBe(true);
      expect(result.isSuspect).toBe(false);
    });

    it('rejects out-of-bounds fields', () => {
      const outField = {
        xPt: -5,
        yPt: 100,
        widthPt: 100,
        heightPt: 20,
      };
      const result = validateFieldGeometry(outField, A4_WIDTH_PT, A4_HEIGHT_PT);
      expect(result.isValid).toBe(false);
    });

    it('rejects degenerate / disproportionate checkbox sizes', () => {
      const hugeCheckbox = {
        xPt: 50,
        yPt: 100,
        widthPt: 120,
        heightPt: 15,
        fieldType: 'SINGLE_CHOICE',
      };
      const result = validateFieldGeometry(hugeCheckbox, A4_WIDTH_PT, A4_HEIGHT_PT);
      expect(result.isValid).toBe(false);
    });
  });

  describe('End-to-End Box Geometry in Clustering Pipeline', () => {
    it('properly excludes prompt label from multiline cluster bounds', () => {
      const textItems = [
        { str: 'Osservazioni generali del consiglio di classe:', x: 50, yTop: 100, w: 220, h: 12 },
      ];
      const rawLines: RawLineCandidate[] = [
        { x1: 50, y: 130, x2: 500 },
        { x1: 50, y: 150, x2: 500 },
        { x1: 50, y: 170, x2: 500 },
        { x1: 50, y: 190, x2: 500 },
      ];

      const { proposedFields } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: A4_WIDTH_PT,
        pageHeightPt: A4_HEIGHT_PT,
        rawLines,
        rawRects: [],
        textItems,
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields: [],
      });

      expect(proposedFields.length).toBe(1);
      const field = proposedFields[0];
      expect(field.fieldType).toBe('TEXT_LONG');
      // Field top should be placed below the prompt (prompt bottom = 100 + 12 = 112)
      expect(field.yPt).toBeGreaterThanOrEqual(114);
      // Field height should extend to cover the ruled lines
      expect(field.yPt + field.heightPt).toBeGreaterThanOrEqual(190);
    });

    it('applies inner padding and prompt exclusion inside large rectangular cells', () => {
      const textItems = [
        { str: 'Interventi educativi:', x: 55, yTop: 204, w: 120, h: 12 },
      ];
      const rawRects: RawRectCandidate[] = [
        { x: 50, y: 200, w: 480, h: 150 },
      ];

      const { proposedFields } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: A4_WIDTH_PT,
        pageHeightPt: A4_HEIGHT_PT,
        rawLines: [],
        rawRects,
        textItems,
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields: [],
      });

      expect(proposedFields.length).toBe(1);
      const field = proposedFields[0];
      expect(field.fieldType).toBe('TEXT_LONG');
      // Starts below the internal header prompt
      expect(field.yPt).toBeGreaterThanOrEqual(218);
      // Width has 2 pt inner padding on sides
      expect(field.xPt).toBeGreaterThanOrEqual(52);
    });

    it('positions short single field after left-aligned prompt label', () => {
      const textItems = [
        { str: 'Cognome:', x: 50, yTop: 100, w: 45, h: 12 },
      ];
      const rawLines: RawLineCandidate[] = [
        { x1: 50, y: 114, x2: 250 },
      ];

      const { proposedFields } = clusterAndRefineCandidates({
        pageNumber: 1,
        pageWidthPt: A4_WIDTH_PT,
        pageHeightPt: A4_HEIGHT_PT,
        rawLines,
        rawRects: [],
        textItems,
        acroformCandidates: [],
        textLayerCandidates: [],
        existingFields: [],
      });

      expect(proposedFields.length).toBe(1);
      const field = proposedFields[0];
      // Field X must start after 'Cognome:' (50 + 45 = 95 -> xPt >= 99)
      expect(field.xPt).toBeGreaterThanOrEqual(95);
      expect(field.widthPt).toBeGreaterThanOrEqual(30);
    });
  });
});
