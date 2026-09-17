/**
 * @license
 * PEI FACILE — Executive Geometry Validation Tests (Phase 1A R01)
 * Validates canonical coordinate constraints, hash integrity, bounds, and transform reversibility.
 */

import { describe, it, expect } from 'vitest';
import type { ModelGeometry } from './types';
import {
  pdfPointToViewport,
  viewportToPdfPoint,
  canonicalTopLeftToPdfBottomLeft,
  pdfBottomLeftToCanonicalTopLeft,
  isFieldWithinPageBounds,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
} from './geometryTransform';

import A1Geometry from './A1.geometry.json';
import A2Geometry from './A2.geometry.json';
import A3Geometry from './A3.geometry.json';
import A4Geometry from './A4.geometry.json';

const EXPECTED_HASHES: Record<string, string> = {
  A1: 'affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c',
  A2: '3eb708f7ae405308858505bf160d8d1dbdb3cf9d291c1bbaf072835ac8521a1f',
  A3: '8975f4ffb763c9faa914d6b1f8c34c30b68c5fb167e9d8751befcdc0cb695728',
  A4: '9fef25e6eafc03f7a63f6812cd9a7dab9490a056f37ac6b5f384c30be5e73b47',
};

const MODELS: ModelGeometry[] = [
  A1Geometry as unknown as ModelGeometry,
  A2Geometry as unknown as ModelGeometry,
  A3Geometry as unknown as ModelGeometry,
  A4Geometry as unknown as ModelGeometry,
];

describe('Phase 1A — Executive Geometry Validation', () => {
  describe('Source PDF Hash & Metadata Integrity', () => {
    MODELS.forEach((model) => {
      it(`Model ${model.modelId} has valid source PDF and matching SHA-256`, () => {
        expect(model.sourcePdf).toBeTruthy();
        expect(model.sourcePdfSha256).toBe(EXPECTED_HASHES[model.modelId]);
        expect(model.totalPages).toBeGreaterThanOrEqual(12);
        expect(model.pages.length).toBe(model.totalPages);
      });
    });
  });

  describe('Page Dimensions & Bounds Constraints', () => {
    MODELS.forEach((model) => {
      it(`Model ${model.modelId} has valid A4 page dimensions on all pages`, () => {
        model.pages.forEach((page) => {
          expect(page.widthPt).toBe(A4_WIDTH_PT);
          expect(page.heightPt).toBe(A4_HEIGHT_PT);
          expect(page.pageNumber).toBeGreaterThan(0);
          expect(page.pageNumber).toBeLessThanOrEqual(model.totalPages);
        });
      });

      it(`Model ${model.modelId} has strictly valid coordinates within page bounds for all mapped fields`, () => {
        model.pages.forEach((page) => {
          page.fields.forEach((field) => {
            if (field.status === 'MAPPED') {
              expect(field.xPt).toBeGreaterThanOrEqual(0);
              expect(field.yPt).toBeGreaterThanOrEqual(0);
              expect(field.widthPt).toBeGreaterThan(0);
              expect(field.heightPt).toBeGreaterThan(0);
              expect(field.xPt + field.widthPt).toBeLessThanOrEqual(A4_WIDTH_PT);
              expect(field.yPt + field.heightPt).toBeLessThanOrEqual(A4_HEIGHT_PT);
              expect(isFieldWithinPageBounds(field, page.widthPt, page.heightPt)).toBe(true);
            } else {
              // Unmapped must have explicit reason
              expect(field.status).toBe('UNMAPPED');
              expect(field.reason).toBeTruthy();
            }
          });
        });
      });
    });
  });

  describe('Field Uniqueness & Explicit Status', () => {
    MODELS.forEach((model) => {
      it(`Model ${model.modelId} has unique field IDs and no duplicates across pages`, () => {
        const fieldIds = new Set<string>();
        model.pages.forEach((page) => {
          page.fields.forEach((field) => {
            expect(fieldIds.has(field.fieldId)).toBe(false);
            fieldIds.add(field.fieldId);
            expect(['MAPPED', 'UNMAPPED', 'REVIEW_REQUIRED']).toContain(field.status);
            expect([
              'ACROFORM',
              'ANNOTATION',
              'VECTOR_BOUNDARY',
              'TEXT_ANCHOR',
              'TABLE_CELL',
              'MANUAL_VERIFIED',
            ]).toContain(field.derivationMethod);
            expect(field.confidence).toBeGreaterThan(0);
            expect(field.confidence).toBeLessThanOrEqual(1.0);
          });
        });
      });
    });
  });

  describe('Deterministic Coordinate Transform Reversibility', () => {
    it('Reversibly converts between PDF points and viewport pixels across multiple scales', () => {
      const testScales = [0.75, 1.0, 1.25, 1.5, 2.0];
      const testPoints = [
        { xPt: 55.0, yPt: 120.0, widthPt: 485.0, heightPt: 85.0 },
        { xPt: 160.0, yPt: 65.0, widthPt: 280.0, heightPt: 32.0 },
        { xPt: 350.0, yPt: 285.0, widthPt: 180.0, heightPt: 22.0 },
      ];

      testScales.forEach((scale) => {
        testPoints.forEach((pt) => {
          const vp = pdfPointToViewport(pt.xPt, pt.yPt, pt.widthPt, pt.heightPt, scale);
          const back = viewportToPdfPoint(vp.leftPx, vp.topPx, vp.widthPx, vp.heightPx, scale);

          // Sub-pixel rounding tolerance within 0.1 pt
          expect(Math.abs(back.xPt - pt.xPt)).toBeLessThanOrEqual(0.1);
          expect(Math.abs(back.yPt - pt.yPt)).toBeLessThanOrEqual(0.1);
          expect(Math.abs(back.widthPt - pt.widthPt)).toBeLessThanOrEqual(0.1);
          expect(Math.abs(back.heightPt - pt.heightPt)).toBeLessThanOrEqual(0.1);
        });
      });
    });

    it('Reversibly converts between Canonical Top-Left and Standard PDF Bottom-Left coordinates', () => {
      const pt = { xPt: 55.0, yPt: 120.0, widthPt: 485.0, heightPt: 85.0 };
      const bl = canonicalTopLeftToPdfBottomLeft(pt.xPt, pt.yPt, pt.widthPt, pt.heightPt);
      const back = pdfBottomLeftToCanonicalTopLeft(bl.x, bl.yBottom, bl.width, bl.height);

      expect(back.xPt).toBe(pt.xPt);
      expect(back.yPt).toBe(pt.yPt);
      expect(back.widthPt).toBe(pt.widthPt);
      expect(back.heightPt).toBe(pt.heightPt);
    });
  });
});
