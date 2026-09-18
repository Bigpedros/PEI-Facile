/**
 * @license
 * PEI FACILE — Executive Geometry Transform Utilities (Phase 1A R01)
 * Deterministic conversion between Canonical PDF points, PDF.js viewport, and CSS overlay coordinates.
 */

import type { FieldGeometry, ViewportCoordinate, PdfBottomLeftCoordinate } from './types';

/** Standard A4 dimensions in typographic points (72 pt / inch) */
export const A4_WIDTH_PT = 595.32;
export const A4_HEIGHT_PT = 841.92;

export interface OverlayRect {
  xCss: number;
  yCss: number;
  widthCss: number;
  heightCss: number;
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Centralized function to convert Canonical PDF coordinates (origin: top-left, units: points)
 * to screen / CSS overlay pixels for a given zoom scale.
 *
 * @param field Bounding box in canonical PDF points
 * @param scale Viewport zoom factor (1.0 = 100%, 1.2 = 120%, 1.4 = 140%)
 */
export function pdfRectToOverlayRect(
  field: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  scale: number
): OverlayRect {
  const safeScale = scale > 0 ? scale : 1.0;
  const xCss = Math.round(field.xPt * safeScale * 100) / 100;
  const yCss = Math.round(field.yPt * safeScale * 100) / 100;
  const widthCss = Math.round(field.widthPt * safeScale * 100) / 100;
  const heightCss = Math.round(field.heightPt * safeScale * 100) / 100;

  return {
    xCss,
    yCss,
    widthCss,
    heightCss,
    leftPx: xCss,
    topPx: yCss,
    widthPx: widthCss,
    heightPx: heightCss,
  };
}

/**
 * Inverse transform: converts screen / CSS overlay pixels back to Canonical PDF coordinates.
 *
 * @param rect CSS overlay rectangle coordinates
 * @param scale Current zoom scale
 */
export function overlayRectToPdfRect(
  rectOrX:
    | {
        xCss?: number;
        yCss?: number;
        widthCss?: number;
        heightCss?: number;
        leftPx?: number;
        topPx?: number;
        widthPx?: number;
        heightPx?: number;
      }
    | number,
  scaleOrY?: number,
  widthCssParam?: number,
  heightCssParam?: number,
  scaleParam?: number
): { xPt: number; yPt: number; widthPt: number; heightPt: number } {
  let x = 0;
  let y = 0;
  let w = 0;
  let h = 0;
  let scale = 1.0;

  if (typeof rectOrX === 'object' && rectOrX !== null) {
    x = rectOrX.xCss !== undefined ? rectOrX.xCss : (rectOrX.leftPx ?? 0);
    y = rectOrX.yCss !== undefined ? rectOrX.yCss : (rectOrX.topPx ?? 0);
    w = rectOrX.widthCss !== undefined ? rectOrX.widthCss : (rectOrX.widthPx ?? 0);
    h = rectOrX.heightCss !== undefined ? rectOrX.heightCss : (rectOrX.heightPx ?? 0);
    scale = scaleOrY ?? 1.0;
  } else {
    x = typeof rectOrX === 'number' ? rectOrX : 0;
    y = typeof scaleOrY === 'number' ? scaleOrY : 0;
    w = typeof widthCssParam === 'number' ? widthCssParam : 0;
    h = typeof heightCssParam === 'number' ? heightCssParam : 0;
    scale = typeof scaleParam === 'number' ? scaleParam : 1.0;
  }

  if (scale <= 0) {
    throw new Error('Viewport scale must be greater than zero');
  }

  return {
    xPt: Math.round((x / scale) * 100) / 100,
    yPt: Math.round((y / scale) * 100) / 100,
    widthPt: Math.round((w / scale) * 100) / 100,
    heightPt: Math.round((h / scale) * 100) / 100,
  };
}

/**
 * Converts Canonical PDF coordinates (origin: top-left, units: points)
 * to screen / viewport pixels for a given zoom scale.
 * Kept for backwards compatibility with ViewportCoordinate consumers.
 */
export function pdfPointToViewport(
  xPt: number,
  yPt: number,
  widthPt: number,
  heightPt: number,
  scale: number
): ViewportCoordinate {
  const overlay = pdfRectToOverlayRect({ xPt, yPt, widthPt, heightPt }, scale);
  return {
    leftPx: overlay.leftPx,
    topPx: overlay.topPx,
    widthPx: overlay.widthPx,
    heightPx: overlay.heightPx,
  };
}

/**
 * Converts screen / viewport pixels back to Canonical PDF coordinates (origin: top-left, units: points).
 * Kept for backwards compatibility.
 */
export function viewportToPdfPoint(
  leftPx: number,
  topPx: number,
  widthPx: number,
  heightPx: number,
  scale: number
): { xPt: number; yPt: number; widthPt: number; heightPt: number } {
  return overlayRectToPdfRect({ leftPx, topPx, widthPx, heightPx }, scale);
}

/**
 * Converts a rectangle from native PDF coordinates (origin: bottom-left)
 * to Canonical PDF coordinates (origin: top-left).
 * Uses PDF.js viewport.convertToViewportRectangle if a viewport is provided,
 * which automatically handles rotation (0, 90, 180, 270) and cropBox offsets.
 *
 * @param nativeRect [x1, y1, x2, y2] in native PDF coordinates
 * @param pageHeightPt Height of the page in points
 * @param viewport Optional PDF.js PageViewport instance
 */
export function pdfRectFromNativePdf(
  nativeRect: [number, number, number, number],
  pageHeightPt: number,
  viewport?: any
): { xPt: number; yPt: number; widthPt: number; heightPt: number } {
  if (viewport && typeof viewport.convertToViewportRectangle === 'function') {
    const vRect = viewport.convertToViewportRectangle(nativeRect);
    const vScale = viewport.scale || 1.0;
    const xMin = Math.min(vRect[0], vRect[2]) / vScale;
    const yMin = Math.min(vRect[1], vRect[3]) / vScale;
    const width = Math.abs(vRect[2] - vRect[0]) / vScale;
    const height = Math.abs(vRect[3] - vRect[1]) / vScale;

    return {
      xPt: Math.round(xMin * 100) / 100,
      yPt: Math.round(yMin * 100) / 100,
      widthPt: Math.round(width * 100) / 100,
      heightPt: Math.round(height * 100) / 100,
    };
  }

  const [x1, y1, x2, y2] = nativeRect;
  const xPt = Math.min(x1, x2);
  const widthPt = Math.abs(x2 - x1);
  const heightPt = Math.abs(y2 - y1);
  const yBottom = Math.min(y1, y2);
  const yPt = pageHeightPt - yBottom - heightPt;

  return {
    xPt: Math.round(xPt * 100) / 100,
    yPt: Math.round(yPt * 100) / 100,
    widthPt: Math.round(widthPt * 100) / 100,
    heightPt: Math.round(heightPt * 100) / 100,
  };
}

/**
 * Clamps a field bounding box strictly to page bounds.
 * Discards fields that are completely outside or degenerate.
 * Clamps partially overlapping fields to stay strictly within [0, 0, pageWidthPt, pageHeightPt].
 */
export function clampFieldToPageBounds<T extends { xPt: number; yPt: number; widthPt: number; heightPt: number }>(
  field: T,
  pageWidthPt = A4_WIDTH_PT,
  pageHeightPt = A4_HEIGHT_PT,
  minDimensionPt = 6,
  tolerance = 1.0
): T | null {
  // Discard if completely outside
  if (field.xPt + field.widthPt < -tolerance || field.yPt + field.heightPt < -tolerance) {
    return null;
  }
  if (field.xPt > pageWidthPt + tolerance || field.yPt > pageHeightPt + tolerance) {
    return null;
  }
  if (field.widthPt <= 0 || field.heightPt <= 0) {
    return null;
  }

  // Normalize partially out-of-bound coords
  let x = Math.max(0, field.xPt);
  let y = Math.max(0, field.yPt);
  let w = field.widthPt - (x - field.xPt);
  let h = field.heightPt - (y - field.yPt);

  if (x + w > pageWidthPt) {
    w = pageWidthPt - x;
  }
  if (y + h > pageHeightPt) {
    h = pageHeightPt - y;
  }

  // Discard if remaining dimensions are below minimum viable field size
  if (w < minDimensionPt || h < minDimensionPt) {
    return null;
  }

  return {
    ...field,
    xPt: Math.round(x * 100) / 100,
    yPt: Math.round(y * 100) / 100,
    widthPt: Math.round(w * 100) / 100,
    heightPt: Math.round(h * 100) / 100,
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

/**
 * Calculates optimal viewport scale to fit entire page inside available canvas viewport area (R08-R5).
 */
export function calculateFitScale(
  availableWidth: number,
  availableHeight: number,
  pageWidthPt = A4_WIDTH_PT,
  pageHeightPt = A4_HEIGHT_PT,
  paddingPx = 32
): number {
  if (availableWidth <= 0 || availableHeight <= 0 || pageWidthPt <= 0 || pageHeightPt <= 0) {
    return 1.0;
  }
  const usableWidth = Math.max(50, availableWidth - paddingPx);
  const usableHeight = Math.max(50, availableHeight - paddingPx);

  const scaleX = usableWidth / pageWidthPt;
  const scaleY = usableHeight / pageHeightPt;
  const fitScale = Math.min(scaleX, scaleY);

  // Clamp between 0.25 (25%) and 2.50 (250%)
  return Math.round(Math.max(0.25, Math.min(2.50, fitScale)) * 100) / 100;
}

/**
 * Calculates viewport scale to fit page width to available canvas viewport width (R08-R5).
 */
export function calculateFitWidthScale(
  availableWidth: number,
  pageWidthPt = A4_WIDTH_PT,
  paddingPx = 32
): number {
  if (availableWidth <= 0 || pageWidthPt <= 0) {
    return 1.0;
  }
  const usableWidth = Math.max(50, availableWidth - paddingPx);
  const scaleX = usableWidth / pageWidthPt;

  return Math.round(Math.max(0.25, Math.min(2.50, scaleX)) * 100) / 100;
}

/**
 * Snaps field coordinates to detected structural vector/raster lines or rectangles
 * within a controlled small tolerance (±3–8 pt) (R08-R5).
 */
export function snapFieldToDetectedStructure<T extends { xPt: number; yPt: number; widthPt: number; heightPt: number }>(
  field: T,
  detectedLines: Array<{ x1: number; y: number; x2: number }>,
  detectedRects: Array<{ x: number; y: number; w: number; h: number }>,
  tolerancePt = 6
): T {
  let left = field.xPt;
  let top = field.yPt;
  let right = field.xPt + field.widthPt;
  let bottom = field.yPt + field.heightPt;

  // 1. Check nearby rects (strongest structure alignment)
  for (const rect of detectedRects) {
    if (
      Math.abs(left - rect.x) <= tolerancePt &&
      Math.abs(top - rect.y) <= tolerancePt
    ) {
      left = rect.x;
      top = rect.y;
    }
    if (Math.abs(right - (rect.x + rect.w)) <= tolerancePt) {
      right = rect.x + rect.w;
    }
    if (Math.abs(bottom - (rect.y + rect.h)) <= tolerancePt) {
      bottom = rect.y + rect.h;
    }
  }

  // 2. Check nearby horizontal lines
  for (const line of detectedLines) {
    // Line near bottom of field (compilation baseline)
    if (Math.abs(bottom - line.y) <= tolerancePt && line.x2 > left && line.x1 < right) {
      bottom = line.y;
    }
    // Line near top of field
    if (Math.abs(top - line.y) <= tolerancePt && line.x2 > left && line.x1 < right) {
      top = line.y;
    }
    // Snap left/right if close to line endpoints
    if (Math.abs(left - line.x1) <= tolerancePt && Math.abs(bottom - line.y) <= 12) {
      left = line.x1;
    }
    if (Math.abs(right - line.x2) <= tolerancePt && Math.abs(bottom - line.y) <= 12) {
      right = line.x2;
    }
  }

  const finalWidth = Math.max(10, right - left);
  const finalHeight = Math.max(10, bottom - top);

  return {
    ...field,
    xPt: Math.round(left * 10) / 10,
    yPt: Math.round(top * 10) / 10,
    widthPt: Math.round(finalWidth * 10) / 10,
    heightPt: Math.round(finalHeight * 10) / 10,
  };
}

/**
 * Validates field geometry against page boundaries, plausible dimensions, and aspect ratio (R08-R5).
 */
export function validateFieldGeometry(
  field: { xPt: number; yPt: number; widthPt: number; heightPt: number; fieldType?: string },
  pageWidthPt = A4_WIDTH_PT,
  pageHeightPt = A4_HEIGHT_PT
): { isValid: boolean; isSuspect: boolean; reason?: string } {
  // Check basic bounds
  if (
    field.xPt < 0 ||
    field.yPt < 0 ||
    field.widthPt <= 0 ||
    field.heightPt <= 0 ||
    field.xPt + field.widthPt > pageWidthPt + 2 ||
    field.yPt + field.heightPt > pageHeightPt + 2
  ) {
    return { isValid: false, isSuspect: true, reason: 'OUT_OF_BOUNDS' };
  }

  // Dimension & Aspect ratio checks per type
  const type = field.fieldType || 'TEXT_SHORT';

  if (type === 'SINGLE_CHOICE' || type === 'CHECKBOX') {
    if (field.widthPt < 6 || field.widthPt > 40 || field.heightPt < 6 || field.heightPt > 40) {
      return { isValid: false, isSuspect: true, reason: 'INVALID_CHECKBOX_SIZE' };
    }
    const ratio = field.widthPt / field.heightPt;
    if (ratio < 0.5 || ratio > 2.0) {
      return { isValid: false, isSuspect: true, reason: 'CHECKBOX_ASPECT_RATIO_DISPROPORTIONATE' };
    }
  } else if (type === 'TEXT_LONG') {
    if (field.widthPt < 40 || field.heightPt < 18) {
      return { isValid: false, isSuspect: true, reason: 'MULTILINE_TOO_SMALL' };
    }
    if (field.heightPt > pageHeightPt * 0.95 || field.widthPt > pageWidthPt * 0.98) {
      return { isValid: false, isSuspect: true, reason: 'MULTILINE_DISPROPORTIONATELY_LARGE' };
    }
  } else {
    // TEXT_SHORT / DATE / etc.
    if (field.widthPt < 20 || field.heightPt < 8) {
      return { isValid: false, isSuspect: true, reason: 'FIELD_TOO_SMALL' };
    }
    if (field.heightPt > 60 && field.widthPt < 100) {
      return { isValid: false, isSuspect: true, reason: 'SHORT_FIELD_TOO_TALL' };
    }
    if (field.widthPt > pageWidthPt * 0.98 && field.heightPt < 10) {
      return { isValid: false, isSuspect: true, reason: 'DEGENERATE_LINE_RECT' };
    }
  }

  return { isValid: true, isSuspect: false };
}

/**
 * Structural Anchor Type classification for physical bounding box grounding (R08-R6).
 */
export type StructureAnchorType =
  | 'RECT_ANCHOR'
  | 'CELL_ANCHOR'
  | 'LINE_ANCHOR'
  | 'LABEL_ANCHOR'
  | 'MULTILINE_REGION_ANCHOR'
  | 'NONE';

export interface GeometryFitEvaluation {
  score: number; // 0.00 to 1.00
  isSuspect: boolean;
  anchorType: StructureAnchorType;
  reason?: string;
  overlapScore?: number;
  labelExclusionScore?: number;
  boundaryScore?: number;
}

/**
 * Extracts inner fillable rectangle from a cell or rectangular boundary,
 * excluding any prompt label header and applying inner padding (R08-R6).
 */
export function extractCellInteriorRect(
  box: { x: number; y: number; w: number; h: number },
  prompt?: { x: number; yTop: number; w: number; h: number; str?: string } | null,
  paddingPt = 2
): {
  isHeaderOnly: boolean;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  anchorType: StructureAnchorType;
} {
  // If cell is shallow (h <= 32 pt) and contains a header/label prompt leaving no room (< 14 pt) for input,
  // it is a pure table/section header cell!
  if (prompt && box.h <= 32) {
    const promptBottom = prompt.yTop + prompt.h;
    const remainingH = box.y + box.h - promptBottom;
    if (remainingH < 14 || prompt.h / box.h >= 0.45) {
      return {
        isHeaderOnly: true,
        xPt: box.x,
        yPt: box.y,
        widthPt: box.w,
        heightPt: box.h,
        anchorType: 'CELL_ANCHOR',
      };
    }
  }

  let fieldX = Math.round((box.x + paddingPt) * 10) / 10;
  let fieldW = Math.max(20, Math.round((box.w - 2 * paddingPt) * 10) / 10);
  let fieldY = Math.round((box.y + paddingPt) * 10) / 10;
  let fieldH = Math.max(16, Math.round((box.h - 2 * paddingPt) * 10) / 10);

  if (prompt && prompt.yTop >= box.y - 2 && prompt.yTop <= box.y + 35) {
    // Prompt sits at top of cell -> field starts directly below prompt
    const promptBottom = prompt.yTop + prompt.h + 2;
    fieldY = Math.round(promptBottom * 10) / 10;
    const remainingH = box.y + box.h - paddingPt - fieldY;
    fieldH = Math.max(16, Math.round(remainingH * 10) / 10);
  }

  return {
    isHeaderOnly: false,
    xPt: fieldX,
    yPt: fieldY,
    widthPt: fieldW,
    heightPt: fieldH,
    anchorType: 'CELL_ANCHOR',
  };
}

/**
 * Evaluates the quality and precision of a candidate field's bounding box fit (R08-R6).
 * Computes GEOMETRY_FIT_SCORE based on bounds compliance, label exclusion, cell containment, and aspect ratio.
 */
export function calculateGeometryFitScore(
  field: {
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
    fieldType?: string;
  },
  options?: {
    pageWidthPt?: number;
    pageHeightPt?: number;
    promptLabelBounds?: { x: number; yTop: number; w: number; h: number } | null;
    targetCellBounds?: { x: number; y: number; w: number; h: number } | null;
    anchorType?: StructureAnchorType;
  }
): GeometryFitEvaluation {
  const pageWidth = options?.pageWidthPt ?? A4_WIDTH_PT;
  const pageHeight = options?.pageHeightPt ?? A4_HEIGHT_PT;
  const prompt = options?.promptLabelBounds;
  const targetCell = options?.targetCellBounds;
  const anchorType = options?.anchorType ?? (targetCell ? 'CELL_ANCHOR' : 'NONE');

  // 1. Boundary & In-Page Check
  let boundaryScore = 1.0;
  if (
    field.xPt < 0 ||
    field.yPt < 0 ||
    field.widthPt <= 0 ||
    field.heightPt <= 0 ||
    field.xPt + field.widthPt > pageWidth + 2 ||
    field.yPt + field.heightPt > pageHeight + 2
  ) {
    return {
      score: 0.1,
      isSuspect: true,
      anchorType,
      reason: 'OUT_OF_PAGE_BOUNDS',
      boundaryScore: 0.1,
      labelExclusionScore: 1.0,
      overlapScore: 0.1,
    };
  }

  // 2. Aspect Ratio / Size plausibility
  let sizeScore = 1.0;
  const fType = field.fieldType || 'TEXT_SHORT';
  if (fType === 'SINGLE_CHOICE' || fType === 'CHECKBOX') {
    if (field.widthPt < 6 || field.widthPt > 35 || field.heightPt < 6 || field.heightPt > 35) {
      sizeScore = 0.3;
    }
  } else if (fType === 'TEXT_LONG') {
    if (field.heightPt < 18 || field.widthPt < 40) {
      sizeScore = 0.4;
    }
  } else {
    // TEXT_SHORT
    if (field.heightPt < 8 || field.heightPt > 60 || field.widthPt < 18) {
      sizeScore = 0.4;
    }
  }

  // 3. Label Exclusion Check (Field must NOT occlude or sit on top of prompt label)
  let labelExclusionScore = 1.0;
  if (prompt) {
    const xOverlap = Math.max(0, Math.min(field.xPt + field.widthPt, prompt.x + prompt.w) - Math.max(field.xPt, prompt.x));
    const yOverlap = Math.max(0, Math.min(field.yPt + field.heightPt, prompt.yTop + prompt.h) - Math.max(field.yPt, prompt.yTop));
    const overlapArea = xOverlap * yOverlap;
    const promptArea = prompt.w * prompt.h;

    if (promptArea > 0 && overlapArea / promptArea > 0.15) {
      // Direct collision with label!
      labelExclusionScore = 0.2;
    }
  }

  // 4. Cell Containment Check (If inside cell, must adhere to cell boundary)
  let containmentScore = 1.0;
  if (targetCell) {
    const cellRight = targetCell.x + targetCell.w;
    const cellBottom = targetCell.y + targetCell.h;
    const fieldRight = field.xPt + field.widthPt;
    const fieldBottom = field.yPt + field.heightPt;

    const overflows =
      field.xPt < targetCell.x - 2 ||
      field.yPt < targetCell.y - 2 ||
      fieldRight > cellRight + 2 ||
      fieldBottom > cellBottom + 2;

    if (overflows) {
      containmentScore = 0.5;
    }
  }

  // Final weighted score (heavily penalized if colliding with label)
  let rawScore =
    boundaryScore * 0.3 + sizeScore * 0.25 + labelExclusionScore * 0.25 + containmentScore * 0.2;

  if (labelExclusionScore < 0.5) {
    rawScore = Math.min(0.40, rawScore * labelExclusionScore);
  }

  const totalScore = Math.round(rawScore * 100) / 100;
  const isSuspect = totalScore < 0.60;

  return {
    score: totalScore,
    isSuspect,
    anchorType,
    reason: isSuspect ? (labelExclusionScore < 0.5 ? 'LABEL_COLLISION' : sizeScore < 0.5 ? 'SIZE_DISPROPORTIONATE' : 'ALIGNMENT_SUSPECT') : undefined,
    boundaryScore,
    labelExclusionScore,
    overlapScore: containmentScore,
  };
}

