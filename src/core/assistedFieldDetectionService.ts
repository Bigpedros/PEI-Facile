import { detectCanonicalPageFields } from './documental/detection';
/**
 * @license
 * PEI FACILE — Assisted Field Detection Engine (Phase 1C R08 / R08-R1)
 * Local-first, human-in-the-loop assisted field detection combining:
 * 1. Native PDF structure (AcroForm widgets, annotations, text layer coordinates)
 * 2. Vector Graphics & Path analysis (pdfjs getOperatorList for lines, boxes, checkboxes)
 * 3. Visual / Raster analysis (scanned / image fallback on rendered canvas)
 * 4. Text & Semantic matching against Canonical Semantic Catalog
 * 5. Strict Label -> Compilation Area geometry (never on top of label)
 * 6. Duplicate prevention & non-destructive re-detection
 */

import * as pdfjsLib from 'pdfjs-dist';
import type {
  FieldGeometry,
  PageGeometry,
  FieldBackgroundMode,
  FieldDetectionSource,
} from '../data/geometry/types';
import type { TemplateFieldType } from './templateSchemaTypes';
import {
  generateFieldId,
  suggestSemanticKey,
  type SemanticSuggestionResult,
} from './semanticCatalog';
export { suggestSemanticKey, type SemanticSuggestionResult };
import {
  clampFieldToPageBounds,
  pdfRectFromNativePdf,
  isExplicitPrompt,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
} from '../data/geometry/geometryTransform';
import {
  clusterAndRefineCandidates,
  isValidLabel,
  type RawLineCandidate,
  type RawRectCandidate,
} from './fieldCandidateClustering';
import { runHybridDetectionPipeline } from './canonical-template-engine/geometry/hybridDetectionEngine';
import { analyzeDocumentImage } from './ocrEngine';
import { renderPdfPageToCanvas } from './pdfIntakeService';
import { PeiOcrCteAdapter } from '../integrations/ocrCte/PeiOcrCteAdapter';

export interface DetectPageFieldsOptions {
  canvasElement?: HTMLCanvasElement;
  onDiagnostics?: (diagnostics: PageDetectionDiagnostics) => void;
  customOcrRunner?: (canvas: HTMLCanvasElement) => Promise<{
    words?: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
    text?: string;
    rawText?: string;
    confidence?: number;
  }>;
}

export interface PageDetectionDiagnostics {
  textItemsCount: number | null;
  annotationsCount: number | null;
  vectorCandidatesCount: number | null;
  labelCandidatesCount: number | null;
  checkboxRadioCandidatesCount: number | null;
  candidatesRaw: number | null;
  candidatesDeduplicated: number | null;
  matchedExisting: number | null;
  newProposals: number | null;
  ignoredDuplicates: number | null;
  ignoredRejected: number | null;
  finalProposalsCount: number | null;
  rasterFallbackUsed: boolean;
  ocrFallbackUsed: boolean;
  rawOcrWordsCount?: number | null;
  validOcrTextItemsCount?: number | null;
  // R08-R4 & R08-R6 Specific Counters
  rawLinesCount?: number | null;
  rawRectsCount?: number | null;
  rawTextCount?: number | null;
  rawCheckboxCount?: number | null;
  rawTotalCount?: number | null;
  clustersCount?: number | null;
  mergedCount?: number | null;
  filteredStructureCount?: number | null;
  filteredLowConfidenceCount?: number | null;
  overDetectionSuspected?: boolean;
  expectedStructuralRegionsCount?: number | null;
  uncoveredPlausibleRegionsCount?: number | null;
  recoveryPassAddedCount?: number | null;
  underDetectionSuspected?: boolean;
  discardedReasons?: Record<string, number>;
}

/**
 * Computes a quantized, normalized geometric fingerprint for a field candidate.
 * Tolerates small differences in coordinate jitter (grid tolerance of 4-6 pt).
 */
export function computeFieldFingerprint(
  field: {
    pageNumber: number;
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
    fieldType?: string;
    detectionSource?: string;
    label?: string;
    suggestedLabel?: string;
  },
  gridTolerance = 5
): string {
  const normX = Math.round(field.xPt / gridTolerance) * gridTolerance;
  const normY = Math.round(field.yPt / gridTolerance) * gridTolerance;
  const normW = Math.round(field.widthPt / (gridTolerance * 2)) * (gridTolerance * 2);
  const normH = Math.round(field.heightPt / gridTolerance) * gridTolerance;
  const normLabel = (field.suggestedLabel || field.label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16);
  return `p${field.pageNumber}_${normX}_${normY}_${normW}_${normH}_${normLabel}_${field.fieldType || 'TEXT'}`;
}

export type FieldProvenance = 'AUTO_DETECTED' | 'USER_CONFIRMED' | 'MANUAL_CREATED' | 'NATIVE_FORM';

export function getFieldProvenance(field: FieldGeometry): FieldProvenance {
  if (
    field.detectionSource === 'MANUAL_ENTRY' ||
    field.derivationMethod === 'MANUAL' ||
    field.derivationMethod === 'USER_CREATED'
  ) {
    return 'MANUAL_CREATED';
  }
  if (field.derivationMethod === 'ACROFORM') {
    return 'NATIVE_FORM';
  }
  if (
    field.calibrationStatus === 'CONFIRMED' ||
    field.calibrationStatus === 'MODIFIED' ||
    field.isModifiedAfterProposal === true ||
    field.derivationMethod === 'MANUAL_VERIFIED'
  ) {
    return 'USER_CONFIRMED';
  }
  return 'AUTO_DETECTED';
}

/** Fields whose geometry must survive automatic reconstruction. */
export function isProtectedDetectionField(field: FieldGeometry): boolean {
  return getFieldProvenance(field) !== 'AUTO_DETECTED' || field.calibrationStatus === 'REJECTED';
}

export function classifyDetectionCandidates(candidates: FieldGeometry[], existing: FieldGeometry[], pageNumber: number) {
  const protectedFields = existing.filter(isProtectedDetectionField);
  const proposals = candidates.filter(c => !protectedFields.some(e => isSubstantialDuplicate(c, e, pageNumber)));
  const matchedAutomatic = proposals.filter(c => existing.some(e => !isProtectedDetectionField(e) && isSubstantialDuplicate(c, e, pageNumber)));
  return { proposals, protectedDuplicates: candidates.filter(c => !proposals.includes(c)), matchedAutomatic,
    newProposals: proposals.filter(c => !matchedAutomatic.includes(c)) };
}

/**
 * Evaluates whether a candidate field is a substantial duplicate of an existing field
 * using a multi-factor combination of IoU, containment ratio, center distance, line-band overlap,
 * and label/semantic similarity.
 */
export function isSubstantialDuplicate(
  cand: {
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
    label?: string;
    suggestedLabel?: string;
    semanticKey?: string | null;
    suggestedSemanticKey?: string | null;
  },
  existing: FieldGeometry,
  pageNumber: number
): boolean {
  if (existing.pageNumber !== pageNumber) return false;

  // 1. Check IoU or Area-Intersection over min area
  const overlap = computeBoundingBoxOverlap(cand, existing);
  if (overlap >= 0.45) return true;

  const xLeft = Math.max(cand.xPt, existing.xPt);
  const xRight = Math.min(cand.xPt + cand.widthPt, existing.xPt + existing.widthPt);
  const yTop = Math.max(cand.yPt, existing.yPt);
  const yBottom = Math.min(cand.yPt + cand.heightPt, existing.yPt + existing.heightPt);

  const minW = Math.min(cand.widthPt, existing.widthPt);
  const maxW = Math.max(cand.widthPt, existing.widthPt);
  const widthRatio = maxW > 0 ? minW / maxW : 1.0;

  if (xRight > xLeft && yBottom > yTop) {
    const interArea = (xRight - xLeft) * (yBottom - yTop);
    const minArea = Math.min(cand.widthPt * cand.heightPt, existing.widthPt * existing.heightPt);
    // Overly wide field covering multiple sub-fields should NOT suppress narrower sub-field proposals
    if (widthRatio >= 0.6 && minArea > 0 && interArea / minArea >= 0.55) return true;
    const maxArea = Math.max(cand.widthPt * cand.heightPt, existing.widthPt * existing.heightPt);
    if (maxArea > 0 && interArea / maxArea >= 0.5) return true;
  }

  // 2. Center distance close + size similarity
  const centerCandX = cand.xPt + cand.widthPt / 2;
  const centerCandY = cand.yPt + cand.heightPt / 2;
  const centerExX = existing.xPt + existing.widthPt / 2;
  const centerExY = existing.yPt + existing.heightPt / 2;
  const distCenter = Math.hypot(centerCandX - centerExX, centerCandY - centerExY);

  if (distCenter <= 18) {
    const heightRatio = Math.min(cand.heightPt, existing.heightPt) / Math.max(cand.heightPt, existing.heightPt);
    if (widthRatio > 0.35 && heightRatio > 0.35) return true;
  }

  // 3. Same horizontal band with significant horizontal overlap
  const yDiff = Math.abs(cand.yPt - existing.yPt);
  if (yDiff <= 8) {
    const hOverlap = Math.max(0, xRight - xLeft);
    // Overly wide field covering multiple sub-fields should NOT suppress narrower sub-field proposals
    if (widthRatio >= 0.6 && minW > 0 && hOverlap / minW >= 0.5) return true;
  }

  // 4. Semantic / label match on nearby position
  const candLbl = (cand.suggestedLabel || cand.label || '').toLowerCase().trim();
  const exLbl = (existing.suggestedLabel || existing.label || '').toLowerCase().trim();
  const candSem = cand.suggestedSemanticKey || cand.semanticKey;
  const exSem = existing.suggestedSemanticKey || existing.semanticKey;
  const labelMatches =
    Boolean(candLbl && exLbl && (candLbl === exLbl || candLbl.includes(exLbl) || exLbl.includes(candLbl))) ||
    Boolean(candSem && exSem && candSem === exSem);
  if (labelMatches && Math.abs(cand.yPt - existing.yPt) <= 16 && Math.abs(cand.xPt - existing.xPt) <= 50) {
    return true;
  }

  return false;
}

export interface DetectPageFieldsOptions {
  onDiagnostics?: (diag: PageDetectionDiagnostics) => void;
  canvasElement?: HTMLCanvasElement | null;
}

/**
 * Calculates geometric Intersection over Area between two bounding boxes.
 * Returns a value between 0.0 (no overlap) and 1.0 (exact match).
 */
export function computeBoundingBoxOverlap(
  boxA: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  boxB: { xPt: number; yPt: number; widthPt: number; heightPt: number }
): number {
  const xLeft = Math.max(boxA.xPt, boxB.xPt);
  const yTop = Math.max(boxA.yPt, boxB.yPt);
  const xRight = Math.min(boxA.xPt + boxA.widthPt, boxB.xPt + boxB.widthPt);
  const yBottom = Math.min(boxA.yPt + boxA.heightPt, boxB.yPt + boxB.heightPt);

  if (xRight <= xLeft || yBottom <= yTop) {
    return 0;
  }

  const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
  const areaA = boxA.widthPt * boxA.heightPt;
  const areaB = boxB.widthPt * boxB.heightPt;
  const minArea = Math.min(areaA, areaB);

  if (minArea <= 0) return 0;
  return intersectionArea / minArea;
}

/**
 * Heuristic to suggest backgroundMode:
 * If the bounding box region intersects pre-printed guidelines, underscores, or text in the PDF,
 * suggest 'OPAQUE_WHITE' so the typed content covers the background cleanly.
 * Otherwise suggest 'TRANSPARENT'.
 */
export function suggestBackgroundMode(
  fieldBox: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  textItems: Array<{ x: number; yTop: number; w: number; h: number; str: string }>
): FieldBackgroundMode {
  const innerMarginX = Math.min(8, fieldBox.widthPt * 0.1);
  const innerMarginY = Math.min(4, fieldBox.heightPt * 0.1);

  const innerBox = {
    xPt: fieldBox.xPt + innerMarginX,
    yPt: fieldBox.yPt + innerMarginY,
    widthPt: Math.max(1, fieldBox.widthPt - 2 * innerMarginX),
    heightPt: Math.max(1, fieldBox.heightPt - 2 * innerMarginY),
  };

  for (const it of textItems) {
    const itemBox = {
      xPt: it.x,
      yPt: it.yTop,
      widthPt: it.w,
      heightPt: it.h,
    };
    const overlap = computeBoundingBoxOverlap(innerBox, itemBox);
    if (overlap > 0.25) {
      return 'OPAQUE_WHITE';
    }
  }

  return 'TRANSPARENT';
}

/**
 * Checks whether a text string represents a form label candidate in Italian educational forms.
 */
export function isLabelPrompt(str: string): boolean {
  return isExplicitPrompt(str);
}

/**
 * Extracts vector lines and boxes from PDF OperatorList if available.
 */
async function extractVectorGraphics(
  pdfPage: any,
  pageWidthPt: number,
  pageHeightPt: number,
  viewport?: any
): Promise<{
  lines: Array<{ x1: number; y: number; x2: number }>;
  boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
}> {
  const lines: Array<{ x1: number; y: number; x2: number }> = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }> = [];

  if (typeof pdfPage.getOperatorList !== 'function') {
    return { lines, boxes };
  }

  try {
    const opList = await pdfPage.getOperatorList();
    if (!opList || !Array.isArray(opList.fnArray)) {
      return { lines, boxes };
    }

    const fns = opList.fnArray;
    const args = opList.argsArray;
    const OPS = ((pdfjsLib as any).OPS || {}) as Record<string, any>;

    let currentX = 0;
    let currentY = 0;

    // CTM (Current Transformation Matrix) tracking for nested graphics / XObjects
    let ctm = [1, 0, 0, 1, 0, 0];
    const ctmStack: number[][] = [];

    const multiplyCtm = (m: number[]) => {
      ctm = [
        ctm[0] * m[0] + ctm[1] * m[2],
        ctm[0] * m[1] + ctm[1] * m[3],
        ctm[2] * m[0] + ctm[3] * m[2],
        ctm[2] * m[1] + ctm[3] * m[3],
        ctm[4] * m[0] + ctm[5] * m[2] + m[4],
        ctm[4] * m[1] + ctm[5] * m[3] + m[5],
      ];
    };

    const applyCtm = (x: number, y: number): [number, number] => {
      return [
        ctm[0] * x + ctm[2] * y + ctm[4],
        ctm[1] * x + ctm[3] * y + ctm[5],
      ];
    };

    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i];
      const arg = args[i];

      // Matrix stack operations (save, restore, transform)
      if (fn === OPS.save || fn === 28) {
        ctmStack.push([...ctm]);
      } else if (fn === OPS.restore || fn === 29) {
        if (ctmStack.length > 0) {
          ctm = ctmStack.pop()!;
        }
      } else if ((fn === OPS.transform || fn === 30) && Array.isArray(arg) && arg.length >= 6) {
        multiplyCtm(arg);
      } else if (fn === OPS.constructPath && Array.isArray(arg) && Array.isArray(arg[0])) {
        // constructPath contains moveTo, lineTo, rectangle etc.
        const pathOps = arg[0];
        const coords = arg[1] || [];
        let cIdx = 0;

        for (const pOp of pathOps) {
          if (pOp === OPS.moveTo || pOp === 0) {
            const rawX = coords[cIdx++] || 0;
            const rawY = coords[cIdx++] || 0;
            const [tx, ty] = applyCtm(rawX, rawY);
            currentX = tx;
            currentY = ty;
          } else if (pOp === OPS.lineTo || pOp === 1) {
            const rawX = coords[cIdx++] || 0;
            const rawY = coords[cIdx++] || 0;
            const [nextX, nextY] = applyCtm(rawX, rawY);

            // Horizontal line detection (PDF coords: bottom-up)
            if (Math.abs(nextY - currentY) < 2.5 && Math.abs(nextX - currentX) >= 25) {
              const nativeX1 = Math.min(currentX, nextX);
              const nativeX2 = Math.max(currentX, nextX);
              const nativeY = currentY;

              const canonical = pdfRectFromNativePdf(
                [nativeX1, nativeY, nativeX2, nativeY],
                pageHeightPt,
                viewport
              );

              const x1 = canonical.xPt;
              const x2 = canonical.xPt + canonical.widthPt;
              const yTop = canonical.yPt;

              // Enforce bounds: discard vector lines outside the visible page
              if (x1 >= -2 && x2 <= pageWidthPt + 2 && yTop >= -2 && yTop <= pageHeightPt + 2) {
                const clampedX1 = Math.max(0, x1);
                const clampedX2 = Math.min(pageWidthPt, x2);
                const clampedY = Math.max(0, Math.min(pageHeightPt, yTop));
                if (clampedX2 - clampedX1 >= 25) {
                  lines.push({
                    x1: Math.round(clampedX1 * 10) / 10,
                    y: Math.round(clampedY * 10) / 10,
                    x2: Math.round(clampedX2 * 10) / 10,
                  });
                }
              }
            }
            currentX = nextX;
            currentY = nextY;
          } else if (pOp === OPS.rectangle || pOp === 4) {
            const rawRx = coords[cIdx++] || 0;
            const rawRy = coords[cIdx++] || 0;
            const rawRw = coords[cIdx++] || 0;
            const rawRh = coords[cIdx++] || 0;
            const [p1x, p1y] = applyCtm(rawRx, rawRy);
            const [p2x, p2y] = applyCtm(rawRx + rawRw, rawRy + rawRh);
            const minX = Math.min(p1x, p2x);
            const maxX = Math.max(p1x, p2x);
            const minY = Math.min(p1y, p2y);
            const maxY = Math.max(p1y, p2y);

            const canonical = pdfRectFromNativePdf(
              [minX, minY, maxX, maxY],
              pageHeightPt,
              viewport
            );

            const rx = canonical.xPt;
            const yTop = canonical.yPt;
            const wPt = canonical.widthPt;
            const hPt = canonical.heightPt;

            const isCheckbox = wPt >= 8 && wPt <= 24 && hPt >= 8 && hPt <= 24;
            // Enforce bounds: discard rectangles outside the visible page
            if (
              rx >= -2 &&
              rx + wPt <= pageWidthPt + 2 &&
              yTop >= -2 &&
              yTop + hPt <= pageHeightPt + 2 &&
              wPt >= 8 &&
              hPt >= 8
            ) {
              const clampedX = Math.max(0, rx);
              const clampedY = Math.max(0, yTop);
              const clampedW = Math.min(pageWidthPt - clampedX, wPt);
              const clampedH = Math.min(pageHeightPt - clampedY, hPt);
              if (clampedW >= 8 && clampedH >= 8) {
                boxes.push({
                  x: Math.round(clampedX * 10) / 10,
                  y: Math.round(clampedY * 10) / 10,
                  w: Math.round(clampedW * 10) / 10,
                  h: Math.round(clampedH * 10) / 10,
                  isCheckbox,
                });
              }
            }
          }
        }
      } else if (
        (fn === OPS.rectangle || fn === 4 || fn === 84 || (fn === 11 && typeof arg[0] === 'number')) &&
        Array.isArray(arg) &&
        arg.length >= 4
      ) {
        const [rawRx, rawRy, rawRw, rawRh] = arg;
        const [p1x, p1y] = applyCtm(rawRx, rawRy);
        const [p2x, p2y] = applyCtm(rawRx + rawRw, rawRy + rawRh);
        const minX = Math.min(p1x, p2x);
        const maxX = Math.max(p1x, p2x);
        const minY = Math.min(p1y, p2y);
        const maxY = Math.max(p1y, p2y);

        const canonical = pdfRectFromNativePdf(
          [minX, minY, maxX, maxY],
          pageHeightPt,
          viewport
        );

        const rx = canonical.xPt;
        const yTop = canonical.yPt;
        const wPt = canonical.widthPt;
        const hPt = canonical.heightPt;
        const isCheckbox = wPt >= 8 && wPt <= 24 && hPt >= 8 && hPt <= 24;

        if (
          rx >= -2 &&
          rx + wPt <= pageWidthPt + 2 &&
          yTop >= -2 &&
          yTop + hPt <= pageHeightPt + 2 &&
          wPt >= 8 &&
          hPt >= 8
        ) {
          const clampedX = Math.max(0, rx);
          const clampedY = Math.max(0, yTop);
          const clampedW = Math.min(pageWidthPt - clampedX, wPt);
          const clampedH = Math.min(pageHeightPt - clampedY, hPt);
          if (clampedW >= 8 && clampedH >= 8) {
            boxes.push({
              x: Math.round(clampedX * 10) / 10,
              y: Math.round(clampedY * 10) / 10,
              w: Math.round(clampedW * 10) / 10,
              h: Math.round(clampedH * 10) / 10,
              isCheckbox,
            });
          }
        }
      }
    }
  } catch {
    // Non-fatal if operator list cannot be parsed
  }

  return { lines, boxes };
}

/**
 * Detects visual lines and boxes from a canvas element (or fallback visual structural analysis).
 * Scans rows and columns for dark pixels to find printed compilation lines, vertical separators,
 * rectangular bounding boxes, table grid cells, and checkboxes.
 *
 * CTE-FIX-03E: Includes Text Masking, Lateral Dark Pixel Density Validation,
 * Colinear Merging, Vertical Line Structural Connection Rules, and Closed-Cell/Checkbox Validation.
 */
export function detectVisualLinesFromCanvas(
  canvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  textItems?: Array<{ x: number; yTop: number; w: number; h: number; str?: string }>
): {
  lines: Array<{ x1: number; y: number; x2: number }>;
  boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
  verticalLines?: Array<{ x: number; y1: number; y2: number }>;
} {
  const lines: Array<{ x1: number; y: number; x2: number }> = [];
  const verticalLines: Array<{ x: number; y1: number; y2: number }> = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }> = [];

  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { lines, boxes, verticalLines };

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return { lines, boxes, verticalLines };

    const scaleX = width / pageWidthPt;
    const scaleY = height / pageHeightPt;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Helper: test if pixel is dark (ink/border)
    const isDarkAt = (px: number, py: number): boolean => {
      if (px < 0 || px >= width || py < 0 || py >= height) return false;
      const idx = (py * width + px) * 4;
      const a = data[idx + 3];
      if (a < 90) return false;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Fast integer luminance: (0.299R + 0.587G + 0.114B) < 155
      return (r * 299 + g * 587 + b * 114) < 155000;
    };

    // Calculate median text height for proportional thresholds
    let medianTextH = 10;
    if (textItems && textItems.length > 0) {
      const heights = textItems.map((t) => t.h).filter((h) => h >= 4 && h <= 40).sort((a, b) => a - b);
      if (heights.length > 0) {
        medianTextH = heights[Math.floor(heights.length / 2)];
      }
    }

    const minHorizLineLenPx = Math.max(10, Math.round(11 * scaleX));
    const minVertLineLenPx = Math.max(10, Math.round(11 * scaleY));

    const stepY = Math.max(1, Math.round(2 * scaleY));
    const stepX = Math.max(1, Math.round(1.5 * scaleX));

    // 1. Scan horizontal line segments
    const rawH: Array<{ x1: number; y: number; x2: number }> = [];
    for (let py = 4; py < height - 4; py += stepY) {
      let startX = -1;
      for (let px = 4; px < width - 4; px += stepX) {
        if (isDarkAt(px, py)) {
          if (startX === -1) startX = px;
        } else {
          if (startX !== -1) {
            const len = px - startX;
            if (len >= minHorizLineLenPx) {
              rawH.push({
                x1: Math.round((startX / scaleX) * 10) / 10,
                y: Math.round((py / scaleY) * 10) / 10,
                x2: Math.round((px / scaleX) * 10) / 10,
              });
            }
            startX = -1;
          }
        }
      }
      if (startX !== -1 && (width - 4 - startX) >= minHorizLineLenPx) {
        rawH.push({
          x1: Math.round((startX / scaleX) * 10) / 10,
          y: Math.round((py / scaleY) * 10) / 10,
          x2: Math.round(((width - 4) / scaleX) * 10) / 10,
        });
      }
    }

    // Filter raw horizontal segments against Text Mask (Phase 2 & 3)
    const filteredH: Array<{ x1: number; y: number; x2: number }> = [];
    for (const hSeg of rawH) {
      const len = hSeg.x2 - hSeg.x1;
      if (len < 8) continue; // Micro-segment elimination

      if (textItems && textItems.length > 0) {
        // Check if horizontal segment lies strictly inside text body (internal character strokes/serifs)
        const insideTextBody = textItems.some((t) => {
          const inY = hSeg.y >= t.yTop + 2.5 && hSeg.y <= t.yTop + t.h - 3; // strictly inside text body, not baseline/underline!
          const inX = hSeg.x1 >= t.x - 2 && hSeg.x2 <= t.x + t.w + 2;
          return inY && inX;
        });
        if (insideTextBody) continue;
      }
      filteredH.push(hSeg);
    }

    // Merge colinear horizontal segments
    const sortedH = [...filteredH].sort((a, b) => (Math.abs(a.y - b.y) <= 2.5 ? a.x1 - b.x1 : a.y - b.y));
    const mergedH: Array<{ x1: number; y: number; x2: number }> = [];
    for (const seg of sortedH) {
      const last = mergedH[mergedH.length - 1];
      if (last && Math.abs(last.y - seg.y) <= 2.5 && seg.x1 <= last.x2 + 16) {
        last.x2 = Math.max(last.x2, seg.x2);
      } else {
        mergedH.push({ ...seg });
      }
    }
    for (const h of mergedH) {
      if (h.x2 - h.x1 >= 8) {
        lines.push(h);
      }
    }

    // 2. Scan vertical line segments (Phase 4 - Critical Cleanup)
    const stepX_v = Math.max(1, Math.round(2 * scaleX));
    const stepY_v = Math.max(1, Math.round(1.5 * scaleY));

    const rawV: Array<{ x: number; y1: number; y2: number }> = [];
    for (let px = 4; px < width - 4; px += stepX_v) {
      let startY = -1;
      for (let py = 4; py < height - 4; py += stepY_v) {
        if (isDarkAt(px, py)) {
          if (startY === -1) startY = py;
        } else {
          if (startY !== -1) {
            const len = py - startY;
            if (len >= minVertLineLenPx) {
              rawV.push({
                x: Math.round((px / scaleX) * 10) / 10,
                y1: Math.round((startY / scaleY) * 10) / 10,
                y2: Math.round((py / scaleY) * 10) / 10,
              });
            }
            startY = -1;
          }
        }
      }
      if (startY !== -1 && (height - 4 - startY) >= minVertLineLenPx) {
        rawV.push({
          x: Math.round((px / scaleX) * 10) / 10,
          y1: Math.round((startY / scaleY) * 10) / 10,
          y2: Math.round(((height - 4) / scaleY) * 10) / 10,
        });
      }
    }

    // Filter vertical segments (Text Mask + Lateral Dark Pixel Density Check)
    const filteredV: Array<{ x: number; y1: number; y2: number }> = [];
    for (const vSeg of rawV) {
      const vLen = vSeg.y2 - vSeg.y1;
      if (vLen < 12) continue; // Micro vertical segment elimination

      // Text Mask Check: Is this vertical segment a character stem ('l', 'I', '1', 't', 'b', 'd', 'M', 'H', etc.)?
      if (textItems && textItems.length > 0) {
        const isGlyphStem = textItems.some((t) => {
          const inX = vSeg.x >= t.x - 3 && vSeg.x <= t.x + t.w + 3;
          const inY = vSeg.y1 >= t.yTop - 2 && vSeg.y2 <= t.yTop + t.h + 2;
          const isGlyphHeight = vLen <= t.h * 1.35;
          return inX && inY && isGlyphHeight;
        });
        if (isGlyphStem) continue;
      }

      // Lateral Dark Pixel Density Check:
      // Real structural vertical dividers have white background on left or right.
      // Character stems inside words ('M', 'W', 'H', 'B', 'E', 'K') have dark pixels 3px to left & right.
      const pxCanvas = Math.round(vSeg.x * scaleX);
      const py1Canvas = Math.round(vSeg.y1 * scaleY);
      const py2Canvas = Math.round(vSeg.y2 * scaleY);
      const samples = Math.max(3, Math.floor((py2Canvas - py1Canvas) / 4));
      let bothSidesDarkCount = 0;

      for (let s = 0; s < samples; s++) {
        const sy = py1Canvas + Math.round((s / (samples - 1 || 1)) * (py2Canvas - py1Canvas));
        const leftDark = isDarkAt(pxCanvas - 3, sy) || isDarkAt(pxCanvas - 4, sy);
        const rightDark = isDarkAt(pxCanvas + 3, sy) || isDarkAt(pxCanvas + 4, sy);
        if (leftDark && rightDark) {
          bothSidesDarkCount++;
        }
      }

      // If > 40% of sampled points have dark pixels on BOTH left and right, it's inside a glyph/word
      if (samples > 0 && bothSidesDarkCount / samples >= 0.4) {
        continue;
      }

      filteredV.push(vSeg);
    }

    // Merge colinear vertical segments
    const sortedV = [...filteredV].sort((a, b) => (Math.abs(a.x - b.x) <= 3.0 ? a.y1 - b.y1 : a.x - b.x));
    const mergedV: Array<{ x: number; y1: number; y2: number }> = [];
    for (const seg of sortedV) {
      const last = mergedV[mergedV.length - 1];
      if (last && Math.abs(last.x - seg.x) <= 3.0 && seg.y1 <= last.y2 + 12) {
        last.y2 = Math.max(last.y2, seg.y2);
      } else {
        mergedV.push({ ...seg });
      }
    }

    // Structural Connection Check:
    // Short vertical lines (< 35pt) must touch or intersect at least one horizontal structural line
    for (const v of mergedV) {
      const len = v.y2 - v.y1;
      if (len >= 35) {
        verticalLines.push(v);
      } else if (len >= 8) {
        const touchesHorizontal = lines.some(
          (h) =>
            h.x1 <= v.x + 6 &&
            h.x2 >= v.x - 6 &&
            (Math.abs(v.y1 - h.y) <= 8 || Math.abs(v.y2 - h.y) <= 8)
        );
        if (touchesHorizontal) {
          verticalLines.push(v);
        }
      }
    }

    // 3. Assemble Boxes / Cells / Checkboxes (Phase 5 & 6)
    const candidateBoxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }> = [];

    // Method A: Intersection of horizontal lines and vertical lines (Grid & Cell Detection)
    for (let i = 0; i < lines.length; i++) {
      const topL = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        const botL = lines[j];
        const dy = botL.y - topL.y;
        if (dy < 8) continue;
        if (dy > 350) break;

        const xOverlapStart = Math.max(topL.x1, botL.x1);
        const xOverlapEnd = Math.min(topL.x2, botL.x2);
        if (xOverlapEnd - xOverlapStart < 8) continue;

        const matchingV = verticalLines.filter(
          (v) =>
            v.x >= xOverlapStart - 8 &&
            v.x <= xOverlapEnd + 8 &&
            v.y1 <= topL.y + 8 &&
            v.y2 >= botL.y - 8
        );

        if (matchingV.length >= 2) {
          matchingV.sort((a, b) => a.x - b.x);
          for (let k = 0; k < matchingV.length - 1; k++) {
            const vLeft = matchingV[k];
            const vRight = matchingV[k + 1];
            const cellW = vRight.x - vLeft.x;
            if (cellW >= 8 && cellW <= 650) {
              const isCheckbox = cellW >= 8 && cellW <= 28 && dy >= 8 && dy <= 28;
              candidateBoxes.push({
                x: Math.round(vLeft.x * 10) / 10,
                y: Math.round(topL.y * 10) / 10,
                w: Math.round(cellW * 10) / 10,
                h: Math.round(dy * 10) / 10,
                isCheckbox,
              });
            }
          }
        }
      }
    }

    // Method B: Rectangular border confirmation from horizontal line pairs with dark edge pixels
    for (let i = 0; i < lines.length; i++) {
      const topL = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        const botL = lines[j];
        const dy = botL.y - topL.y;
        if (dy < 8) continue;
        if (dy > 250) break;

        const xA = Math.max(topL.x1, botL.x1);
        const xB = Math.min(topL.x2, botL.x2);
        const w = xB - xA;
        if (w < 8) continue;

        const isAligned = Math.abs(topL.x1 - botL.x1) <= 12 && Math.abs(topL.x2 - botL.x2) <= 12;
        if (isAligned) {
          let darkLeft = 0;
          let darkRight = 0;
          const samples = 4;
          for (let s = 1; s <= samples; s++) {
            const sy = Math.round((topL.y + (s / (samples + 1)) * dy) * scaleY);
            const xl = Math.round(xA * scaleX);
            const xr = Math.max(0, Math.round(xB * scaleX) - 1);
            if (isDarkAt(xl, sy) || isDarkAt(xl + 1, sy)) darkLeft++;
            if (isDarkAt(xr, sy) || isDarkAt(xr + 1, sy)) darkRight++;
          }

          if ((darkLeft >= 2 && darkRight >= 2) || (w <= 28 && dy <= 28 && darkLeft >= 1 && darkRight >= 1)) {
            const isCheckbox = w >= 8 && w <= 28 && dy >= 8 && dy <= 28;
            candidateBoxes.push({
              x: Math.round(xA * 10) / 10,
              y: Math.round(topL.y * 10) / 10,
              w: Math.round(w * 10) / 10,
              h: Math.round(dy * 10) / 10,
              isCheckbox,
            });
          }
        }
      }
    }

    // Deduplicate candidate boxes and exclude static header enclosures
    candidateBoxes.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const cand of candidateBoxes) {
      if (cand.x < 0 || cand.y < 0 || cand.x + cand.w > pageWidthPt + 2 || cand.y + cand.h > pageHeightPt + 2) {
        continue;
      }

      // If box is not a checkbox, check if it surrounds static title/header prompts
      if (!cand.isCheckbox && textItems && textItems.length > 0) {
        const containsStaticHeader = textItems.some((it) => {
          const inX = it.x >= cand.x - 6 && it.x + it.w <= cand.x + cand.w + 6;
          const inY = it.yTop >= cand.y - 6 && it.yTop + it.h <= cand.y + cand.h + 6;
          if (inX && inY) {
            const str = (it.str || '').toLowerCase();
            return /intestazione|ministero|repubblica|piano\s+educativo|allegato|scuola\s+dell/i.test(str);
          }
          return false;
        });
        if (containsStaticHeader) {
          continue;
        }
      }

      const duplicate = boxes.some((existing) => {
        const x1 = Math.max(cand.x, existing.x);
        const y1 = Math.max(cand.y, existing.y);
        const x2 = Math.min(cand.x + cand.w, existing.x + existing.w);
        const y2 = Math.min(cand.y + cand.h, existing.y + existing.h);
        if (x2 <= x1 || y2 <= y1) return false;
        const inter = (x2 - x1) * (y2 - y1);
        const union = cand.w * cand.h + existing.w * existing.h - inter;
        return union > 0 && inter / union >= 0.55;
      });
      if (!duplicate) {
        boxes.push(cand);
      }
    }
  } catch {
    // Non-fatal if canvas pixels cannot be accessed
  }

  return { lines, boxes, verticalLines };
}

/**
 * Detects fillable field candidates on a single PDF page.
 * Strictly local-first and human-in-the-loop: all candidates are born with calibrationStatus = 'PROPOSED'.
 */
export async function detectFieldsOnPdfPage(
  pdfPage: any,
  pageNumber: number,
  existingFields: FieldGeometry[] = [],
  options: DetectPageFieldsOptions | HTMLCanvasElement = {}
): Promise<FieldGeometry[]> {
  const opts: DetectPageFieldsOptions =
    options && 'getContext' in (options as any)
      ? { canvasElement: options as HTMLCanvasElement }
      : (options as DetectPageFieldsOptions) || {};

  const result = await detectCanonicalPageFields(pdfPage, pageNumber, opts.customOcrRunner, opts.canvasElement);
  const proposed=result.fields;
  const filtered = proposed.filter(c => !existingFields.some(e => isSubstantialDuplicate(c,e,pageNumber)));
  const markedTokens=result.page.tokens.filter(t=>t.source==='pdf'&&(/_{3,}/.test(t.text)||/^\[\s*[xX]?\s*\]$/.test(t.text.trim())));
  const uncovered=markedTokens.filter(t=>!proposed.some(f=>{
    const b={x:f.xNorm!*result.page.width,y:f.yNorm!*result.page.height,width:f.wNorm!*result.page.width,height:f.hNorm!*result.page.height};
    return Math.min(b.x+b.width,t.box.x+t.box.width)>Math.max(b.x,t.box.x)&&Math.min(b.y+b.height,t.box.y+t.box.height)>Math.max(b.y,t.box.y);
  })).length;
  opts.onDiagnostics?.({textItemsCount:result.textItems,annotationsCount:null,vectorCandidatesCount:null,
    labelCandidatesCount:null,checkboxRadioCandidatesCount:proposed.filter(f=>f.inputType==='checkbox').length,
    candidatesRaw:proposed.length,candidatesDeduplicated:proposed.length,matchedExisting:proposed.length-filtered.length,
    newProposals:filtered.length,ignoredDuplicates:proposed.length-filtered.length,ignoredRejected:0,
    finalProposalsCount:filtered.length,underDetectionSuspected:uncovered>0,uncoveredPlausibleRegionsCount:uncovered,rasterFallbackUsed:true,ocrFallbackUsed:result.source==='ocr',rawOcrWordsCount:result.source==='ocr'?result.tokens:0});
  return filtered;
}

/**
 * Full Runtime Diagnostic Trace Interface (CTE-FIX-02C).
 * Captures real browser data from PDF.js, text items, vector graphics, raster lines, and pipeline transformations.
 */
export interface PageRuntimeDiagnosticTrace {
  timestamp: string;
  detectionRevision?: string;
  detectionDpi?: number;
  renderedFieldGeometry?: any[];
  persistedGeometryRevalidation?: any;
  document: {
    modelId: string;
    modelName: string;
    pageNumber: number;
    pageWidthPt: number;
    pageHeightPt: number;
    viewport: {
      scale: number;
      rotation: number;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
      viewBox?: number[];
      transform?: number[];
    };
    rotation: number;
    mediaBox?: number[] | null;
    cropBox?: number[] | null;
    view?: number[] | null;
  };
  textItems: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rawTransform?: number[];
    fontName?: string;
  }>;
  vectorLines: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    source: string;
    isVertical?: boolean;
  }>;
  vectorBoxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    isCheckbox: boolean;
    source: string;
  }>;
  rasterVisualLines: Array<{
    x1: number;
    y: number;
    x2: number;
    source: string;
  }>;
  rasterBoxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    isCheckbox: boolean;
    source: string;
  }>;
  rawCandidates: Array<{
    id: string;
    type: string;
    bbox: { x: number; y: number; w: number; h: number };
    source: string;
    associatedLabel: string;
    confidence: number;
  }>;
  pipelineTrace: {
    steps: Array<{
      step: string;
      description: string;
      counts: Record<string, any>;
      details?: any;
    }>;
    discarded: Array<{
      candidateId?: string;
      discardedAt: string;
      discardedReason: string;
      relevantValues: Record<string, any>;
    }>;
  };
  finalProposedFields: Array<{
    fieldId: string;
    label: string;
    semanticKey: string | null;
    fieldType: string;
    bbox: { xPt: number; yPt: number; widthPt: number; heightPt: number };
    confidence?: number;
    derivationMethod?: string;
    detectionSource?: string;
    sourceCandidateIds?: string[];
  }>;
}

/**
 * Collects complete real-time runtime diagnostics from the browser on the active PDF page (CTE-FIX-02C / CTE-FIX-02D).
 */
export async function collectPageRuntimeDiagnostics(
  pdfPage: any,
  opts: {
    canvasElement?: HTMLCanvasElement | null;
    modelId?: string;
    modelName?: string;
    pageNumber?: number;
    existingFields?: FieldGeometry[];
    customOcrRunner?: (canvas: HTMLCanvasElement) => Promise<{
      words?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
      text?: string;
      rawText?: string;
      confidence?: number;
    }>;
  }
): Promise<PageRuntimeDiagnosticTrace> {
  const pageNumber=opts.pageNumber||pdfPage.pageNumber||1;
  const viewport=pdfPage.getViewport({scale:1});
  const result=await detectCanonicalPageFields(pdfPage,pageNumber,opts.customOcrRunner,opts.canvasElement||undefined);
  const page=result.page;
  const sx=viewport.width/page.width,sy=viewport.height/page.height;
  const vector=await extractVectorGraphics(pdfPage,viewport.width,viewport.height,viewport);
  const classified=classifyDetectionCandidates(result.fields,opts.existingFields||[],pageNumber);
  const proposed=classified.proposals;
  const textContent=await pdfPage.getTextContent();
  const boxes=page.regions.map(r=>({x:r.box.x*sx,y:r.box.y*sy,width:r.box.width*sx,height:r.box.height*sy,isCheckbox:r.kind==='checkbox',source:'DOCUMENTAL_020'}));
  const rawCandidates=result.fields.map(f=>({id:f.fieldId,type:f.fieldType||'text',bbox:{x:f.xPt,y:f.yPt,w:f.widthPt,h:f.heightPt},source:f.detectionSource||'DOCUMENTAL_020',associatedLabel:f.label,confidence:f.confidence??0}));
  return {timestamp:new Date().toISOString(),detectionRevision:'calibratore-20261007-celle-etichette',detectionDpi:200,document:{modelId:opts.modelId||'CUSTOM_PDF',modelName:opts.modelName||'Documento Attivo',pageNumber,pageWidthPt:viewport.width,pageHeightPt:viewport.height,viewport:{...viewport},rotation:pdfPage.rotate||0,view:pdfPage.view||null},
    textItems:page.tokens.map((t,i)=>({text:t.text.trim(),x:t.box.x*sx,y:t.box.y*sy,width:t.box.width*sx,height:t.box.height*sy,fontName:t.source==='pdf'?textContent.items.filter((t:any)=>t.str?.trim())[i]?.fontName:undefined})),
    vectorLines:vector.lines.map(l=>({x1:l.x1,y1:l.y,x2:l.x2,y2:l.y,source:'PDF'})),
    vectorBoxes:vector.boxes.map(b=>({x:b.x,y:b.y,width:b.w,height:b.h,isCheckbox:b.isCheckbox,source:'PDF'})),
    rasterBoxes:boxes,rasterVisualLines:boxes.flatMap(b=>[{x1:b.x,y:b.y,x2:b.x+b.width,source:'DOCUMENTAL_020'},{x1:b.x,y:b.y+b.height,x2:b.x+b.width,source:'DOCUMENTAL_020'}]),rawCandidates,
    pipelineTrace:{steps:[
      {step:'getTextContent',description:'Testo nativo letto sul raster finale',counts:{rawItemsCount:result.textItems}},
      {step:'extractVectorGraphics',description:'Geometria vettoriale osservata per diagnostica; non una seconda inferenza',counts:{vectorLines:vector.lines.length,vectorBoxes:vector.boxes.length}},
      {step:'ocrExtraction',description:'OCR del nucleo unico, senza seconda esecuzione',counts:{rawOcrWordsCount:page.tokens.filter(t=>t.source==='ocr').length,validOcrTextItemsCount:page.tokens.filter(t=>t.source==='ocr').length,used:result.source==='ocr'}},
      {step:'detectRegions',description:'Regioni misurate sullo stesso raster dei campi',counts:{regions:boxes.length}},
      {step:'inferFields',description:'Candidati del nucleo unico: proposte automatiche aggiornabili, campi revisionati protetti',counts:{rawCandidates:rawCandidates.length,protectedDuplicates:classified.protectedDuplicates.length,matchedAutomatic:classified.matchedAutomatic.length,newProposalsCount:classified.newProposals.length,finalProposalsCount:proposed.length}}],
      discarded:result.fields.filter(f=>!proposed.includes(f)).map(f=>({candidateId:f.fieldId,discardedAt:'protectExisting',discardedReason:'PROTECTED_EXISTING_FIELD',relevantValues:{pageNumber}}))},
    finalProposedFields:proposed.map(f=>({fieldId:f.fieldId,label:f.label,semanticKey:f.semanticKey??null,fieldType:f.fieldType||'text',bbox:{xPt:f.xPt,yPt:f.yPt,widthPt:f.widthPt,heightPt:f.heightPt},confidence:f.confidence,derivationMethod:f.derivationMethod,detectionSource:f.detectionSource,sourceCandidateIds:[f.fieldId]}))};
}

/**
 * Detects fields across all pages of a PDF document page by page.
 * Non-blocking, cancellable via AbortSignal, reporting real progress.
 */
export async function detectFieldsOnEntireDocument(
  pdfDoc: any,
  existingPages: PageGeometry[],
  onProgress?: (current: number, total: number) => void,
  abortSignal?: AbortSignal
): Promise<{ pages: PageGeometry[]; totalProposed: number }> {
  const totalPages = pdfDoc.numPages || existingPages.length;
  const updatedPages: PageGeometry[] = JSON.parse(JSON.stringify(existingPages));
  let totalProposed = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (abortSignal?.aborted) {
      break;
    }

    onProgress?.(pageNum, totalPages);

    let targetPage = updatedPages.find((p) => p.pageNumber === pageNum);
    if (!targetPage) {
      targetPage = {
        pageNumber: pageNum,
        widthPt: 595.32,
        heightPt: 841.92,
        fields: [],
      };
      updatedPages.push(targetPage);
    }

    try {
      const pageProxy = await pdfDoc.getPage(pageNum);
      const protectedFields = targetPage.fields.filter(isProtectedDetectionField);

      const detected = await detectFieldsOnPdfPage(pageProxy, pageNum, protectedFields);

      targetPage.fields = [...protectedFields, ...detected];
      totalProposed += detected.length;
    } catch (err) {
      console.warn(`Detection on page ${pageNum} encountered warning:`, err);
    }

    // Yield to event loop to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { pages: updatedPages, totalProposed };
}
