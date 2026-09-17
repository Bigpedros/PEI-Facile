/**
 * @license
 * PEI FACILE — Executive Geometry Transform Utilities (Phase 1A R01)
 * Deterministic conversion between Canonical PDF points, PDF.js viewport, and CSS overlay coordinates.
 */

import type { FieldGeometry, ViewportCoordinate, PdfBottomLeftCoordinate } from './types';

/** Standard A4 dimensions in typographic points (72 pt / inch) */
export const A4_WIDTH_PT = 595.32;
export const A4_HEIGHT_PT = 841.92;

/**
 * Converts Canonical PDF coordinates (origin: top-left, units: points)
 * to screen / viewport pixels for a given zoom scale.
 *
 * @param xPt Distance in points from the left edge of the page
 * @param yPt Distance in points from the top edge of the page
 * @param widthPt Width in points
 * @param heightPt Height in points
 * @param scale Viewport zoom factor (1.0 = 100% at 72dpi, e.g. 1.5 = 150%)
 */
export function pdfPointToViewport(
  xPt: number,
  yPt: number,
  widthPt: number,
  heightPt: number,
  scale: number
): ViewportCoordinate {
  return {
    leftPx: Math.round(xPt * scale * 100) / 100,
    topPx: Math.round(yPt * scale * 100) / 100,
    widthPx: Math.round(widthPt * scale * 100) / 100,
    heightPx: Math.round(heightPt * scale * 100) / 100,
  };
}

/**
 * Converts screen / viewport pixels back to Canonical PDF coordinates (origin: top-left, units: points).
 * Reversible operation within sub-pixel rounding tolerance.
 */
export function viewportToPdfPoint(
  leftPx: number,
  topPx: number,
  widthPx: number,
  heightPx: number,
  scale: number
): { xPt: number; yPt: number; widthPt: number; heightPt: number } {
  if (scale <= 0) {
    throw new Error('Viewport scale must be greater than zero');
  }
  return {
    xPt: Math.round((leftPx / scale) * 100) / 100,
    yPt: Math.round((topPx / scale) * 100) / 100,
    widthPt: Math.round((widthPx / scale) * 100) / 100,
    heightPt: Math.round((heightPx / scale) * 100) / 100,
  };
}

/**
 * Produces CSS inline style properties for an overlay element on top of a scaled PDF canvas.
 */
export function pdfFieldToCssOverlay(field: FieldGeometry, scale: number): {
  position: 'absolute';
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const vp = pdfPointToViewport(field.xPt, field.yPt, field.widthPt, field.heightPt, scale);
  return {
    position: 'absolute',
    left: `${vp.leftPx}px`,
    top: `${vp.topPx}px`,
    width: `${vp.widthPx}px`,
    height: `${vp.heightPx}px`,
  };
}

/**
 * Converts Canonical Top-Left point coordinates to Standard PDF Bottom-Left coordinates
 * (used when writing directly to low-level PDF streams).
 */
export function canonicalTopLeftToPdfBottomLeft(
  xPt: number,
  yPt: number,
  widthPt: number,
  heightPt: number,
  pageHeightPt = A4_HEIGHT_PT
): PdfBottomLeftCoordinate {
  return {
    x: Math.round(xPt * 100) / 100,
    yBottom: Math.round((pageHeightPt - yPt - heightPt) * 100) / 100,
    width: Math.round(widthPt * 100) / 100,
    height: Math.round(heightPt * 100) / 100,
  };
}

/**
 * Converts Standard PDF Bottom-Left coordinates (from PDF.js raw text transforms)
 * to Canonical Top-Left coordinates.
 */
export function pdfBottomLeftToCanonicalTopLeft(
  x: number,
  yBottom: number,
  width: number,
  height: number,
  pageHeightPt = A4_HEIGHT_PT
): { xPt: number; yPt: number; widthPt: number; heightPt: number } {
  return {
    xPt: Math.round(x * 100) / 100,
    yPt: Math.round((pageHeightPt - yBottom - height) * 100) / 100,
    widthPt: Math.round(width * 100) / 100,
    heightPt: Math.round(height * 100) / 100,
  };
}

/**
 * Validates whether a given field rectangle stays strictly within page bounds.
 */
export function isFieldWithinPageBounds(
  field: FieldGeometry,
  pageWidthPt = A4_WIDTH_PT,
  pageHeightPt = A4_HEIGHT_PT,
  marginTolerancePt = 0.5
): boolean {
  if (field.xPt < -marginTolerancePt || field.yPt < -marginTolerancePt) return false;
  if (field.widthPt <= 0 || field.heightPt <= 0) return false;
  if (field.xPt + field.widthPt > pageWidthPt + marginTolerancePt) return false;
  if (field.yPt + field.heightPt > pageHeightPt + marginTolerancePt) return false;
  return true;
}
