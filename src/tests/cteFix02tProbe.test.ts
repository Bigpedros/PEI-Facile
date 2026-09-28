/**
 * @license
 * PEI FACILE — CTE-FIX-02T Runtime Probe Test Suite
 * Validates the runtime probe instrumentation and coordinate alignment trace.
 */

import { describe, it, expect } from 'vitest';
import { clampFieldToPageBounds, pdfRectToOverlayRect } from '../data/geometry/geometryTransform';

describe('CTE-FIX-02T — Runtime Geometry Probe Suite', () => {
  it('correctly maps canonical field coordinates to css overlay and reports them matching our probe schema', () => {
    const activePageWidthPt = 595.32;
    const activePageHeightPt = 841.92;
    const scale = 1.5;

    // Simulate "Plesso" field geometry in Canonical points
    const plessoField = {
      fieldId: 'plesso_field_1',
      label: 'Plesso',
      xPt: 377.3,
      yPt: 414.7,
      widthPt: 63.1,
      heightPt: 20.3,
      pageNumber: 1,
      detectionSource: 'VECTOR_BOX',
      derivationMethod: 'ACROFORM',
    };

    const clampedField = clampFieldToPageBounds(plessoField, activePageWidthPt, activePageHeightPt) || plessoField;
    const overlay = pdfRectToOverlayRect(clampedField, scale);

    // Replicate probe construction logic
    const probe = {
      fieldId: plessoField.fieldId,
      label: plessoField.label,
      pageNumber: plessoField.pageNumber,
      sourceGeometry: {
        xPt: plessoField.xPt,
        yPt: plessoField.yPt,
        widthPt: plessoField.widthPt,
        heightPt: plessoField.heightPt,
        coordinateSpace: "Canonical PDF Points (origin: top-left)",
        schemaPageWidth: activePageWidthPt,
        schemaPageHeight: activePageHeightPt,
      },
      display: {
        zoom: scale,
        viewportScale: scale,
      },
      finalOverlay: {
        cssLeft: overlay.xCss,
        cssTop: overlay.yCss,
        cssWidth: overlay.widthCss,
        cssHeight: overlay.heightCss,
      },
      sourceGeometryObjectOrigin: plessoField.detectionSource || plessoField.derivationMethod,
    };

    expect(probe.fieldId).toBe('plesso_field_1');
    expect(probe.label).toBe('Plesso');
    expect(probe.sourceGeometry.xPt).toBe(377.3);
    expect(probe.sourceGeometry.yPt).toBe(414.7);
    expect(probe.sourceGeometry.widthPt).toBe(63.1);
    expect(probe.sourceGeometry.heightPt).toBe(20.3);

    // CSS conversion verification: coordinates multiplied by scale (1.5)
    expect(probe.finalOverlay.cssLeft).toBeCloseTo(377.3 * 1.5, 1);
    expect(probe.finalOverlay.cssTop).toBeCloseTo(414.7 * 1.5, 1);
    expect(probe.finalOverlay.cssWidth).toBeCloseTo(63.1 * 1.5, 1);
    expect(probe.finalOverlay.cssHeight).toBeCloseTo(20.3 * 1.5, 1);
  });
});
