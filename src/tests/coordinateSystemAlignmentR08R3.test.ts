import { describe, it, expect } from 'vitest';
import {
  pdfRectToOverlayRect,
  overlayRectToPdfRect,
  pdfRectFromNativePdf,
  clampFieldToPageBounds,
  pdfPointToViewport,
  viewportToPdfPoint,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
} from '../data/geometry/geometryTransform';
import type { FieldGeometry } from '../data/geometry/types';

describe('PEI FACILE — R08-R3 Coordinate System Alignment', () => {
  const sampleField: FieldGeometry = {
    fieldId: 'field_test_coord_1',
    label: 'Campo di Prova',
    pageNumber: 1,
    xPt: 72.0, // 1 inch from left
    yPt: 144.0, // 2 inches from top
    widthPt: 200.0,
    heightPt: 28.0,
    anchorText: 'Prova',
    derivationMethod: 'MANUAL_VERIFIED',
    confidence: 1.0,
    status: 'MAPPED',
  };

  describe('1. Overlay and PDF Coordinates Roundtrip', () => {
    it('accurately transforms PDF points to CSS overlay pixels and roundtrips back at various zoom scales', () => {
      const scales = [0.6, 1.0, 1.2, 1.4, 1.8, 2.0];

      for (const scale of scales) {
        const overlay = pdfRectToOverlayRect(sampleField, scale);

        expect(overlay.xCss).toBeCloseTo(sampleField.xPt * scale, 3);
        expect(overlay.yCss).toBeCloseTo(sampleField.yPt * scale, 3);
        expect(overlay.widthCss).toBeCloseTo(sampleField.widthPt * scale, 3);
        expect(overlay.heightCss).toBeCloseTo(sampleField.heightPt * scale, 3);

        const restored = overlayRectToPdfRect(
          overlay.xCss,
          overlay.yCss,
          overlay.widthCss,
          overlay.heightCss,
          scale
        );

        expect(restored.xPt).toBeCloseTo(sampleField.xPt, 3);
        expect(restored.yPt).toBeCloseTo(sampleField.yPt, 3);
        expect(restored.widthPt).toBeCloseTo(sampleField.widthPt, 3);
        expect(restored.heightPt).toBeCloseTo(sampleField.heightPt, 3);
      }
    });

    it('remains invariant in canonical PDF points when UI zoom is changed', () => {
      // Zoom 100%
      const overlay100 = pdfRectToOverlayRect(sampleField, 1.0);
      // Zoom 140%
      const overlay140 = pdfRectToOverlayRect(sampleField, 1.4);

      // Overlay pixel size increases with scale
      expect(overlay140.widthCss).toBeGreaterThan(overlay100.widthCss);
      expect(overlay140.xCss).toBeGreaterThan(overlay100.xCss);

      // Converting back using respective scale yields exact same canonical points
      const back100 = overlayRectToPdfRect(overlay100.xCss, overlay100.yCss, overlay100.widthCss, overlay100.heightCss, 1.0);
      const back140 = overlayRectToPdfRect(overlay140.xCss, overlay140.yCss, overlay140.widthCss, overlay140.heightCss, 1.4);

      expect(back100.xPt).toBeCloseTo(sampleField.xPt, 4);
      expect(back140.xPt).toBeCloseTo(sampleField.xPt, 4);
      expect(back100.yPt).toBeCloseTo(sampleField.yPt, 4);
      expect(back140.yPt).toBeCloseTo(sampleField.yPt, 4);
    });
  });

  describe('2. PDF Native Coordinates (Bottom-Left) to Top-Left Conversion', () => {
    it('correctly inverts Y-axis for AcroForm annotations and vector paths', () => {
      const pageHeightPt = 841.89; // Standard A4 height
      // PDF AcroForm rect [llx, lly, urx, ury]:
      // 50pt from left, 700pt from bottom, 250pt from left (width 200), 730pt from bottom (height 30)
      const nativePdfRect: [number, number, number, number] = [50, 700, 250, 730];

      const canonical = pdfRectFromNativePdf(nativePdfRect, pageHeightPt);

      expect(canonical.xPt).toBe(50);
      expect(canonical.widthPt).toBe(200);
      expect(canonical.heightPt).toBe(30);
      // Top in DOM/Canvas = pageHeight - ury = 841.89 - 730 = 111.89
      expect(canonical.yPt).toBeCloseTo(841.89 - 730, 2);
    });

    it('handles inverted or unordered coordinates gracefully ([urx, ury, llx, lly])', () => {
      const pageHeightPt = 842;
      const unorderedRect: [number, number, number, number] = [250, 730, 50, 700];

      const canonical = pdfRectFromNativePdf(unorderedRect, pageHeightPt);

      expect(canonical.xPt).toBe(50);
      expect(canonical.widthPt).toBe(200);
      expect(canonical.heightPt).toBe(30);
      expect(canonical.yPt).toBeCloseTo(842 - 730, 2);
    });
  });

  describe('3. Strict Page Boundary Clamping (Anti-Drift / Anti-Overflow)', () => {
    it('clamps fields that would extend beyond the right or bottom edges of the PDF', () => {
      const overflowingField: FieldGeometry = {
        ...sampleField,
        xPt: 550, // 550 + 100 = 650 > 595.28
        widthPt: 100,
        yPt: 800, // 800 + 100 = 900 > 841.89
        heightPt: 100,
      };

      const clamped = clampFieldToPageBounds(overflowingField, A4_WIDTH_PT, A4_HEIGHT_PT);
      expect(clamped).not.toBeNull();
      if (clamped) {
        expect(clamped.xPt + clamped.widthPt).toBeLessThanOrEqual(A4_WIDTH_PT);
        expect(clamped.yPt + clamped.heightPt).toBeLessThanOrEqual(A4_HEIGHT_PT);
        expect(clamped.xPt).toBeGreaterThanOrEqual(0);
        expect(clamped.yPt).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns null or minimum sized field for boxes located entirely outside the page', () => {
      const outsideField: FieldGeometry = {
        ...sampleField,
        xPt: 700, // Entirely off page
        yPt: 900,
        widthPt: 50,
        heightPt: 20,
      };

      const clamped = clampFieldToPageBounds(outsideField, A4_WIDTH_PT, A4_HEIGHT_PT);
      expect(clamped).toBeNull();
    });
  });
});
