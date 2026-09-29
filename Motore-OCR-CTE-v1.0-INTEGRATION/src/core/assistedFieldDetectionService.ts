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
import { detectVisualPrimitivesFromImageData } from './rasterPrimitiveDetector';

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
  textItemsCount: number;
  annotationsCount: number;
  vectorCandidatesCount: number;
  labelCandidatesCount: number;
  checkboxRadioCandidatesCount: number;
  candidatesRaw: number;
  candidatesDeduplicated: number;
  matchedExisting: number;
  newProposals: number;
  ignoredDuplicates: number;
  ignoredRejected: number;
  finalProposalsCount: number;
  rasterFallbackUsed: boolean;
  ocrFallbackUsed: boolean;
  rawOcrWordsCount?: number;
  validOcrTextItemsCount?: number;
  // R08-R4 & R08-R6 Specific Counters
  rawLinesCount?: number;
  rawRectsCount?: number;
  rawTextCount?: number;
  rawCheckboxCount?: number;
  rawTotalCount?: number;
  clustersCount?: number;
  mergedCount?: number;
  filteredStructureCount?: number;
  filteredLowConfidenceCount?: number;
  overDetectionSuspected?: boolean;
  expectedStructuralRegionsCount?: number;
  uncoveredPlausibleRegionsCount?: number;
  recoveryPassAddedCount?: number;
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
  if (field.detectionSource === 'MANUAL_ENTRY') {
    return 'MANUAL_CREATED';
  }
  if (field.derivationMethod === 'ACROFORM') {
    return 'NATIVE_FORM';
  }
  if (
    field.calibrationStatus === 'CONFIRMED' ||
    field.calibrationStatus === 'MODIFIED' ||
    field.isModifiedAfterProposal === true ||
    field.status === 'MAPPED'
  ) {
    return 'USER_CONFIRMED';
  }
  return 'AUTO_DETECTED';
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

  if (xRight > xLeft && yBottom > yTop) {
    const interArea = (xRight - xLeft) * (yBottom - yTop);
    const minArea = Math.min(cand.widthPt * cand.heightPt, existing.widthPt * existing.heightPt);
    if (minArea > 0 && interArea / minArea >= 0.55) return true;
  }

  // 2. Center distance close + size similarity
  const centerCandX = cand.xPt + cand.widthPt / 2;
  const centerCandY = cand.yPt + cand.heightPt / 2;
  const centerExX = existing.xPt + existing.widthPt / 2;
  const centerExY = existing.yPt + existing.heightPt / 2;
  const distCenter = Math.hypot(centerCandX - centerExX, centerCandY - centerExY);

  if (distCenter <= 18) {
    const widthRatio = Math.min(cand.widthPt, existing.widthPt) / Math.max(cand.widthPt, existing.widthPt);
    const heightRatio = Math.min(cand.heightPt, existing.heightPt) / Math.max(cand.heightPt, existing.heightPt);
    if (widthRatio > 0.35 && heightRatio > 0.35) return true;
  }

  // 3. Same horizontal band with significant horizontal overlap
  const yDiff = Math.abs(cand.yPt - existing.yPt);
  if (yDiff <= 8) {
    const hOverlap = Math.max(0, xRight - xLeft);
    const minW = Math.min(cand.widthPt, existing.widthPt);
    if (minW > 0 && hOverlap / minW >= 0.5) return true;
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
      } else if ((fn === OPS.rectangle || fn === 4 || fn === 84) && Array.isArray(arg) && arg.length >= 4) {
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
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
      return { lines: [], boxes: [], verticalLines: [] };
    }
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectVisualPrimitivesFromImageData(
      { width: canvas.width, height: canvas.height, data: imgData.data },
      pageWidthPt,
      pageHeightPt,
      textItems
    );
  } catch {
    return { lines: [], boxes: [], verticalLines: [] };
  }
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

  const viewport = pdfPage.getViewport({ scale: 1.0 });
  const pageWidthPt = viewport.width;
  const pageHeightPt = viewport.height;

  const proposedFields: FieldGeometry[] = [];
  const acroformCandidates: FieldGeometry[] = [];
  const rawLines: RawLineCandidate[] = [];
  const rawRects: RawRectCandidate[] = [];
  const textLayerCandidates: FieldGeometry[] = [];

  let textItemsCount = 0;
  let annotationsCount = 0;
  let vectorCandidatesCount = 0;
  let labelCandidatesCount = 0;
  let checkboxRadioCandidatesCount = 0;
  let candidatesRaw = 0;
  let candidatesDeduplicated = 0;
  let matchedExisting = 0;
  let newProposals = 0;
  let ignoredDuplicates = 0;
  let ignoredRejected = 0;
  let rasterFallbackUsed = false;
  let ocrFallbackUsed = false;

  /**
   * Central evaluation function enforcing:
   * 1. Protection of CONFIRMED, MODIFIED, and MANUAL fields (never duplicated or overwritten).
   * 2. Memory of REJECTED fields (never re-proposed).
   * 3. Idempotence against already PROPOSED fields (consolidates confidence, never creates duplicates).
   * 4. Multi-factor duplicate prevention within current run.
   */
  const evaluateAndAddCandidate = (cand: FieldGeometry): boolean => {
    candidatesRaw++;

    // 0. Boundary & Page Clamp Check: Field must stay strictly within visible page!
    const clamped = clampFieldToPageBounds(cand, pageWidthPt, pageHeightPt);
    if (!clamped) {
      ignoredDuplicates++;
      return false;
    }
    cand.xPt = clamped.xPt;
    cand.yPt = clamped.yPt;
    cand.widthPt = clamped.widthPt;
    cand.heightPt = clamped.heightPt;

    // 1. Check against all existing fields on page
    for (const ef of existingFields) {
      if (isSubstantialDuplicate(cand, ef, pageNumber)) {
        matchedExisting++;
        if (ef.calibrationStatus === 'REJECTED') {
          ignoredRejected++;
          return false;
        }
        if (
          ef.calibrationStatus === 'CONFIRMED' ||
          ef.calibrationStatus === 'MODIFIED' ||
          ef.derivationMethod === 'MANUAL_VERIFIED'
        ) {
          ignoredDuplicates++;
          return false;
        }
        if (ef.calibrationStatus === 'PROPOSED') {
          ignoredDuplicates++;
          // Consolidate higher confidence if available
          if (cand.confidence && cand.confidence > (ef.confidence || 0)) {
            ef.confidence = cand.confidence;
          }
          return false;
        }
        ignoredDuplicates++;
        return false;
      }
    }

    // 2. Check against already proposed candidates in current run
    for (const pf of proposedFields) {
      if (isSubstantialDuplicate(cand, pf, pageNumber)) {
        ignoredDuplicates++;
        return false;
      }
    }

    // Candidate accepted as genuine new proposal
    candidatesDeduplicated++;
    newProposals++;
    proposedFields.push(cand);
    return true;
  };

  // 1. Extract AcroForm Widgets & Form Annotations
  try {
    const annotations = await pdfPage.getAnnotations();
    if (Array.isArray(annotations) && annotations.length > 0) {
      annotationsCount = annotations.length;
      for (const ann of annotations) {
        if (ann.subtype === 'Widget' || ann.fieldType) {
          const rect = ann.rect;
          if (Array.isArray(rect) && rect.length === 4) {
            const canonical = pdfRectFromNativePdf(
              rect as [number, number, number, number],
              pageHeightPt,
              viewport
            );
            const xPt = canonical.xPt;
            const yPt = canonical.yPt;
            const widthPt = canonical.widthPt;
            const heightPt = canonical.heightPt;

            if (widthPt >= 8 && heightPt >= 8) {
              const rawName = ann.alternativeText || ann.fieldName || ann.name || 'Campo Modulo';
              const isChoice = ann.fieldType === 'Btn' || widthPt <= 22;
              const suggestion = suggestSemanticKey(rawName);

              const candField: FieldGeometry = {
                fieldId: generateFieldId(),
                label: suggestion.suggestedLabel || rawName,
                semanticKey: null,
                suggestedSemanticKey: suggestion.semanticKey,
                suggestedLabel: suggestion.suggestedLabel,
                fieldType: isChoice ? 'SINGLE_CHOICE' : suggestion.suggestedFieldType,
                backgroundMode: 'TRANSPARENT',
                calibrationStatus: 'PROPOSED',
                pageNumber,
                xPt,
                yPt,
                widthPt,
                heightPt,
                anchorText: rawName,
                derivationMethod: 'ACROFORM',
                detectionSource: 'ACROFORM',
                confidence: 0.96,
                status: 'REVIEW_REQUIRED',
              };
              acroformCandidates.push(candField);
            }
          }
        }
      }
    }
  } catch {
    // Non-fatal if annotations missing
  }

  // 2. Extract Vector Graphics from OperatorList
  const vectorData = await extractVectorGraphics(pdfPage, pageWidthPt, pageHeightPt, viewport);
  vectorCandidatesCount = vectorData.lines.length + vectorData.boxes.length;
  for (const vl of vectorData.lines) {
    rawLines.push({ x1: vl.x1, y: vl.y, x2: vl.x2, source: 'VECTOR' });
  }
  for (const vb of vectorData.boxes) {
    rawRects.push({ x: vb.x, y: vb.y, w: vb.w, h: vb.h, isCheckbox: vb.isCheckbox, source: 'VECTOR' });
  }

  // 3. Extract Text Layer (Native PDF or Local OCR Fallback)
  let effectiveCanvas = opts.canvasElement;
  if (!effectiveCanvas && typeof document !== 'undefined' && pdfPage.render) {
    try {
      effectiveCanvas = await renderPdfPageToCanvas(pdfPage, 2.0);
    } catch {
      // non-blocking
    }
  }

  let rawItems: any[] = [];
  try {
    const textContent = await pdfPage.getTextContent();
    rawItems = (textContent.items || []).filter((it: any) => it.str && it.str.trim().length > 0) as any[];
    textItemsCount = rawItems.length;
  } catch {
    // Text layer might be absent in scanned documents
  }

  let ocrWords: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
  let rawOcrWordsCount = 0;
  let validOcrTextItemsCount = 0;

  // OCR Fallback for Scanned / Raster Pages
  if (rawItems.length === 0 && effectiveCanvas) {
    try {
      if (opts.customOcrRunner) {
        const ocrRes = await opts.customOcrRunner(effectiveCanvas);
        ocrWords = ocrRes.words || [];
        if (!ocrWords.length && (ocrRes.text || ocrRes.rawText)) {
          const raw = ocrRes.text || ocrRes.rawText || '';
          const cW = effectiveCanvas.width || pageWidthPt;
          const cH = effectiveCanvas.height || pageHeightPt;
          const lines = raw.split('\n').filter((l) => l.trim().length > 0);
          lines.forEach((lStr, lIdx) => {
            const toks = lStr.trim().split(/\s+/);
            let curX = 50;
            const curY = 80 + lIdx * 35;
            toks.forEach((tok) => {
              const tW = Math.max(16, tok.length * 8);
              ocrWords.push({
                text: tok,
                confidence: ocrRes.confidence || 85,
                bbox: {
                  x0: (curX / pageWidthPt) * cW,
                  y0: (curY / pageHeightPt) * cH,
                  x1: ((curX + tW) / pageWidthPt) * cW,
                  y1: ((curY + 14) / pageHeightPt) * cH,
                },
              });
              curX += tW + 8;
            });
          });
        }
        rawOcrWordsCount = ocrWords.length;
        ocrFallbackUsed = true;
      } else if (typeof window !== 'undefined' && effectiveCanvas.toDataURL) {
        const dataUrl = effectiveCanvas.toDataURL('image/png');
        if (dataUrl && dataUrl.startsWith('data:image/png')) {
          const arr = dataUrl.split(',');
          const bstr = atob(arr[1] || '');
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const file = new File([u8arr], `page-${pageNumber}-ocr.png`, { type: 'image/png' });
          const ocrRes = await analyzeDocumentImage(file);
          ocrWords = ocrRes.words || [];
          rawOcrWordsCount = ocrWords.length;
          ocrFallbackUsed = true;
        }
      }
    } catch (ocrErr) {
      console.warn(`[AssistedFieldDetection] OCR fallback warning on page ${pageNumber}:`, ocrErr);
    }
  }

  // Populate textItems from native or OCR
  const textItems: Array<{ x: number; yTop: number; w: number; h: number; str: string }> = [];
  // Keep a geometry-mask stream separate from semantic phrases. Word-level OCR boxes
  // are much safer for raster masking: phrase boxes can span across real checkboxes
  // and underlines and accidentally erase physical structures.
  let geometryMaskTextItems: Array<{ x: number; yTop: number; w: number; h: number; str: string }> = [];

  if (rawItems.length > 0) {
    for (const item of rawItems) {
      const str = item.str.trim();
      const x = item.transform ? item.transform[4] : 0;
      const yBottom = item.transform ? item.transform[5] : 0;
      const w = item.width || 0;
      const h = item.height || (item.transform ? Math.abs(item.transform[0]) || Math.abs(item.transform[3]) : 10);
      const canonical = pdfRectFromNativePdf([x, yBottom, x + w, yBottom + h], pageHeightPt, viewport);
      if (canonical.xPt >= -2 && canonical.xPt < pageWidthPt + 2 && canonical.yPt >= -2 && canonical.yPt < pageHeightPt + 2) {
        textItems.push({
          x: canonical.xPt,
          yTop: canonical.yPt,
          w: canonical.widthPt,
          h: canonical.heightPt,
          str,
        });
      }
    }
    geometryMaskTextItems = textItems.map((it) => ({ ...it }));
  } else if (ocrWords.length > 0) {
    const cWidth = effectiveCanvas?.width || pageWidthPt;
    const cHeight = effectiveCanvas?.height || pageHeightPt;

    const wordsConverted = ocrWords
      .filter((w) => w.text && w.text.trim().length > 0 && w.bbox)
      .map((w) => {
        const x = (w.bbox.x0 / cWidth) * pageWidthPt;
        const yTop = (w.bbox.y0 / cHeight) * pageHeightPt;
        const widthPt = ((w.bbox.x1 - w.bbox.x0) / cWidth) * pageWidthPt;
        const heightPt = ((w.bbox.y1 - w.bbox.y0) / cHeight) * pageHeightPt;
        return {
          x: Math.round(x * 10) / 10,
          yTop: Math.round(yTop * 10) / 10,
          w: Math.max(6, Math.round(widthPt * 10) / 10),
          h: Math.max(8, Math.round(heightPt * 10) / 10),
          str: w.text.trim(),
        };
      })
      .filter((it) => it.x >= -2 && it.x < pageWidthPt + 2 && it.yTop >= -2 && it.yTop < pageHeightPt + 2);

    wordsConverted.sort((a, b) => (Math.abs(a.yTop - b.yTop) < 6 ? a.x - b.x : a.yTop - b.yTop));
    geometryMaskTextItems = wordsConverted.map((it) => ({ ...it }));

    // Also assemble adjacent words on the same baseline into phrases
    const phrases: Array<{ x: number; yTop: number; w: number; h: number; str: string }> = [];
    let currentPhrase: { x: number; yTop: number; w: number; h: number; str: string } | null = null;

    for (const word of wordsConverted) {
      textItems.push(word);

      if (!currentPhrase) {
        currentPhrase = { ...word };
      } else {
        const isSameLine = Math.abs(word.yTop - currentPhrase.yTop) <= Math.max(6, currentPhrase.h * 0.5);
        const gapX = word.x - (currentPhrase.x + currentPhrase.w);
        if (isSameLine && gapX >= -2 && gapX <= 24) {
          currentPhrase.str = `${currentPhrase.str} ${word.str}`;
          currentPhrase.w = Math.round((word.x + word.w - currentPhrase.x) * 10) / 10;
          currentPhrase.h = Math.max(currentPhrase.h, word.h);
        } else {
          if (currentPhrase.str.includes(' ')) {
            phrases.push(currentPhrase);
          }
          currentPhrase = { ...word };
        }
      }
    }
    if (currentPhrase && currentPhrase.str.includes(' ')) {
      phrases.push(currentPhrase);
    }

    textItems.push(...phrases);
    validOcrTextItemsCount = textItems.length;
    textItemsCount = textItems.length;
  }

  // Sort and perform baseline-merge on all textItems to reconstruct full phrases and avoid fragment labels!
  const rawTextItems = [...textItems];
  const mergedTextItems: Array<{ x: number; yTop: number; w: number; h: number; str: string }> = [];
  if (rawTextItems.length > 0) {
    // Sort first to ensure left-to-right order on each line
    rawTextItems.sort((a, b) => (Math.abs(a.yTop - b.yTop) < 5 ? a.x - b.x : a.yTop - b.yTop));
    
    let current = { ...rawTextItems[0] };
    for (let i = 1; i < rawTextItems.length; i++) {
      const next = rawTextItems[i];
      const isSameLine = Math.abs(next.yTop - current.yTop) < 6;
      const gapX = next.x - (current.x + current.w);
      
      // If they are on the same line and the horizontal gap is small (e.g. < 16 pt), merge them!
      if (isSameLine && gapX >= -4 && gapX <= 16) {
        current.str = `${current.str} ${next.str}`;
        current.w = next.x + next.w - current.x;
        current.h = Math.max(current.h, next.h);
      } else {
        mergedTextItems.push(current);
        current = { ...next };
      }
    }
    mergedTextItems.push(current);
  }

  // Use the merged textItems
  textItems.length = 0;
  textItems.push(...mergedTextItems);

  // Sort text items visually top-to-bottom, left-to-right
  textItems.sort((a, b) => (Math.abs(a.yTop - b.yTop) < 6 ? a.x - b.x : a.yTop - b.yTop));

  // 2B. Visual Lines and Boxes from Rendered Canvas (Raster / Scanned support using textItems mask)
  let scannedCanvasData: {
    lines: Array<{ x1: number; y: number; x2: number }>;
    boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
    verticalLines?: Array<{ x: number; y1: number; y2: number }>;
  } = { lines: [], boxes: [], verticalLines: [] };

  if (effectiveCanvas) {
    try {
      scannedCanvasData = detectVisualLinesFromCanvas(
        effectiveCanvas,
        pageWidthPt,
        pageHeightPt,
        geometryMaskTextItems.length ? geometryMaskTextItems : textItems
      );
      if (scannedCanvasData.lines.length > 0 || scannedCanvasData.boxes.length > 0) {
        rasterFallbackUsed = true;
        for (const sl of scannedCanvasData.lines) {
          rawLines.push({ x1: sl.x1, y: sl.y, x2: sl.x2, source: 'CANVAS' });
        }
        for (const vl of scannedCanvasData.verticalLines || []) {
          rawLines.push({ x1: vl.x, y: vl.y1, x2: vl.x, y2: vl.y2, isVertical: true, source: 'CANVAS' });
        }
        for (const sb of scannedCanvasData.boxes) {
          rawRects.push({ x: sb.x, y: sb.y, w: sb.w, h: sb.h, isCheckbox: sb.isCheckbox, source: 'CANVAS' });
        }
      }
    } catch {
      // Ignore canvas access errors
    }
  }

  // Combined geometric features for Step 5 matching
  const allAvailableLines = [
    ...vectorData.lines,
    ...scannedCanvasData.lines.map((l) => ({ x1: l.x1, y: l.y, x2: l.x2 })),
  ];
  const allAvailableBoxes = [
    ...vectorData.boxes,
    ...scannedCanvasData.boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, isCheckbox: b.isCheckbox })),
  ];

  // 4. Process Checkbox / Radio Symbols in Text Layer
  for (const item of textItems) {
    const isChoiceSymbol = /^\[\s*\]|\(\s*\)|□|○|■|●$/.test(item.str);
    if (isChoiceSymbol) {
      checkboxRadioCandidatesCount++;
      const xPt = Math.max(0, Math.round((item.x - 2) * 10) / 10);
      const yPt = Math.max(0, Math.round((item.yTop - 2) * 10) / 10);
      const widthPt = Math.max(16, Math.round((item.w + 4) * 10) / 10);
      const heightPt = Math.max(16, Math.round((item.h + 4) * 10) / 10);

      rawRects.push({
        x: xPt,
        y: yPt,
        w: widthPt,
        h: heightPt,
        isCheckbox: true,
        source: 'VECTOR',
      });
    }
  }

  // 5. Label Candidates & Geometric Association to Compilation Area
  for (let i = 0; i < textItems.length; i++) {
    const item = textItems[i];
    const str = item.str;

    // Skip checkbox symbols already processed
    if (/^\[\s*\]|\(\s*\)|□|○|■|●$/.test(str)) continue;

    // Heuristic 5A: Single text item contains both Label AND Underlines / Dotted fill
    // e.g. "BAMBINO/A ______________________" or "Anno Scolastico ________"
    const compoundMatch = str.match(/^(.*?)[ :_-]*([_—\.]{3,}.*)$/);
    if (compoundMatch) {
      const labelText = compoundMatch[1].trim();
      const cleanLabel = labelText.replace(/:$/, '').trim();
      if (cleanLabel.length >= 2) {
        labelCandidatesCount++;
        const suggestion = suggestSemanticKey(cleanLabel);
        const labelFraction = Math.max(0.15, Math.min(0.85, labelText.length / str.length));
        const xField = Math.round((item.x + item.w * labelFraction + 4) * 10) / 10;
        const widthField = Math.max(80, Math.round((item.w * (1 - labelFraction) + 10) * 10) / 10);
        const yField = Math.max(0, Math.round((item.yTop - 3) * 10) / 10);
        const heightField = suggestion.suggestedFieldType === 'TEXT_LONG' ? 55 : 22;

        textLayerCandidates.push({
          fieldId: generateFieldId(),
          label: suggestion.suggestedLabel || cleanLabel,
          semanticKey: null,
          suggestedSemanticKey: suggestion.semanticKey,
          suggestedLabel: suggestion.suggestedLabel,
          fieldType: suggestion.suggestedFieldType,
          backgroundMode: 'OPAQUE_WHITE',
          calibrationStatus: 'PROPOSED',
          pageNumber,
          xPt: xField,
          yPt: yField,
          widthPt: widthField,
          heightPt: heightField,
          anchorText: str,
          derivationMethod: 'VECTOR_BOUNDARY',
          detectionSource: 'TEXT_LAYER',
          confidence: Math.max(0.88, suggestion.confidence),
          status: 'REVIEW_REQUIRED',
        });
        continue;
      }
    }

    // Heuristic 5B: Separate Label item (e.g. "Anno Scolastico", "BAMBINO/A", "Sezione", "Nome:", "Data:")
    if (isLabelPrompt(str)) {
      const cleanLabel = str.replace(/:$/, '').trim();

      // Short generic token check
      const lowerLabel = cleanLabel.toLowerCase();
      const endsWithColon = str.trim().endsWith(':');
      const isShortGeneric = ['di', 'data', 'personale', 'rivedibilità'].includes(lowerLabel);
      if (isShortGeneric && !endsWithColon) {
        // If it belongs to a larger sentence on the same line, skip it as an autonomous field!
        const hasNeighbor = textItems.some(
          (it) => it.str !== item.str && Math.abs(it.yTop - item.yTop) < 8 && Math.abs(it.x - item.x) < 120
        );
        if (hasNeighbor) {
          continue;
        }
      }

      labelCandidatesCount++;
      const suggestion = suggestSemanticKey(cleanLabel);

      // Check if this is a date field
      const isDatePrompt = /data|nato\s+il|roma,\s*lì|data\s+verifica/i.test(cleanLabel);

      // 1. Look for matching vector or visual line to the right on the same line band (allowing typographic baseline variations)
      const matchingVectorLineRight = allAvailableLines.find(
        (vl) =>
          vl.y >= item.yTop - 4 &&
          vl.y <= item.yTop + item.h + 16 &&
          vl.x2 > item.x + item.w * 0.7 &&
          vl.x1 <= item.x + item.w + 50 &&
          vl.x2 - Math.max(vl.x1, item.x + item.w) >= 30
      );

      // 2. Look for matching vector or visual box/cell to the right of the label
      const matchingVectorBoxRight = allAvailableBoxes.find(
        (vb) =>
          !vb.isCheckbox &&
          vb.y <= item.yTop + item.h + 6 &&
          vb.y + vb.h >= item.yTop - 4 &&
          vb.x >= item.x + item.w - 8 &&
          vb.x <= item.x + item.w + 60 &&
          vb.w >= 30
      );

      // 3. Look for matching vector or visual line directly BELOW the label (underline input area)
      const matchingVectorLineBelow = allAvailableLines.find(
        (vl) =>
          vl.y > item.yTop + item.h &&
          vl.y <= item.yTop + item.h + 20 &&
          vl.x1 <= item.x + 25 &&
          vl.x2 >= item.x + item.w + 25
      );

      // 4. Look for separate underline/dots text item to the right
      const matchingTextUnderline = textItems.find(
        (it) => it !== item && Math.abs(it.yTop - item.yTop) < 10 && it.x >= item.x + item.w - 6 && /[_—\.]{3,}/.test(it.str)
      );

      // 5. Look for adjacent text item on the same horizontal line (e.g. "Classe: [___] Sezione: [___]")
      const nextItemOnSameLine = textItems.find(
        (it) => it !== item && Math.abs(it.yTop - item.yTop) < 10 && it.x > item.x + item.w
      );

      let matchedGeometry = false;
      let xField = 0;
      let yField = 0;
      let widthField = 0;
      let heightField = suggestion.suggestedFieldType === 'TEXT_LONG' ? 55 : 22;
      let bgMode: FieldBackgroundMode = 'TRANSPARENT';
      let confidence = suggestion.confidence || 0.82;
      let derivationMethod: FieldGeometry['derivationMethod'] = 'TEXT_ANCHOR';
      let detectionSource: FieldDetectionSource = 'TEXT_LAYER';

      if (matchingVectorLineRight) {
        xField = Math.round(Math.max(item.x + item.w + 4, matchingVectorLineRight.x1) * 10) / 10;
        let rightLimit = matchingVectorLineRight.x2;
        // Clip rightLimit at the start of any other alphabetic text item on the same line band
        const nextText = textItems.find(
          (it) =>
            it !== item &&
            Math.abs(it.yTop - item.yTop) < 10 &&
            it.x > item.x + item.w &&
            it.x < rightLimit + 10 &&
            /[a-zA-ZàèìòùéÀÈÌÒÙÉ]/.test(it.str)
        );
        if (nextText) {
          rightLimit = Math.min(rightLimit, nextText.x - 4);
        }
        widthField = Math.max(30, Math.round((rightLimit - xField) * 10) / 10);
        yField = Math.max(0, Math.round((matchingVectorLineRight.y - 18) * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.94;
        derivationMethod = 'VECTOR_BOUNDARY';
        detectionSource = 'COMBINED';
        matchedGeometry = true;
      } else if (matchingVectorBoxRight) {
        xField = Math.round((matchingVectorBoxRight.x + 2) * 10) / 10;
        yField = Math.round((matchingVectorBoxRight.y + 2) * 10) / 10;
        widthField = Math.max(30, Math.round((matchingVectorBoxRight.w - 4) * 10) / 10);
        heightField = Math.max(18, Math.round((matchingVectorBoxRight.h - 4) * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.95;
        derivationMethod = 'TABLE_CELL';
        detectionSource = 'COMBINED';
        matchedGeometry = true;
      } else if (matchingVectorLineBelow) {
        xField = Math.round(matchingVectorLineBelow.x1 * 10) / 10;
        yField = Math.round((item.yTop + item.h + 2) * 10) / 10;
        widthField = Math.max(80, Math.round((matchingVectorLineBelow.x2 - xField) * 10) / 10);
        heightField = Math.max(22, Math.round((matchingVectorLineBelow.y - yField + 4) * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.93;
        derivationMethod = 'VECTOR_BOUNDARY';
        detectionSource = 'COMBINED';
        matchedGeometry = true;
      } else if (matchingTextUnderline) {
        xField = Math.round(Math.max(item.x + item.w + 4, matchingTextUnderline.x) * 10) / 10;
        let rightLimit = matchingTextUnderline.x + matchingTextUnderline.w;
        // Clip rightLimit at the start of any other alphabetic text item on the same line band
        const nextText = textItems.find(
          (it) =>
            it !== item &&
            it !== matchingTextUnderline &&
            Math.abs(it.yTop - item.yTop) < 10 &&
            it.x > item.x + item.w &&
            it.x < rightLimit + 10 &&
            /[a-zA-ZàèìòùéÀÈÌÒÙÉ]/.test(it.str)
        );
        if (nextText) {
          rightLimit = Math.min(rightLimit, nextText.x - 4);
        }
        widthField = Math.max(30, Math.round((rightLimit - xField) * 10) / 10);
        yField = Math.max(0, Math.round((item.yTop - 3) * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.92;
        detectionSource = 'TEXT_LAYER';
        matchedGeometry = true;
      }

      // CTE-FIX-03B Binding Rule: WHITE SPACE IS NOT A FIELD.
      // SPATIAL_EMPTY_REGION is an auxiliary metric only and MUST NOT generate autonomous FieldGeometry from OCR label + whitespace alone!
      // If no physical geometry (line, cell, border, underline, checkbox) was matched, matchedGeometry remains false!

      // STRICT DISCRIMINATION: A prompt label WITHOUT physical geometric support (line, box, cell, underline, checkbox)
      // must NEVER generate a field! Geometry precedes semantics.
      if (matchedGeometry && widthField >= 30) {
        labelCandidatesCount++;
        textLayerCandidates.push({
          fieldId: generateFieldId(),
          label: suggestion.suggestedLabel || cleanLabel,
          semanticKey: null,
          suggestedSemanticKey: suggestion.semanticKey,
          suggestedLabel: suggestion.suggestedLabel,
          fieldType: isDatePrompt ? 'DATE' : suggestion.suggestedFieldType,
          backgroundMode: bgMode,
          calibrationStatus: 'PROPOSED',
          pageNumber,
          xPt: xField,
          yPt: yField,
          widthPt: widthField,
          heightPt: heightField,
          anchorText: str,
          derivationMethod,
          detectionSource,
          confidence,
          geometricConfidence: confidence,
          rawGeometricBBox: {
            left: xField,
            top: yField,
            right: xField + widthField,
            bottom: yField + heightField,
          },
          labelAssociationMethod: matchingVectorLineBelow ? 'TOP_HEADER' : 'LEFT_NEIGHBOR',
          status: 'REVIEW_REQUIRED',
        });
      }
    }
  }

  // 6. Master Hybrid Geometric + Heuristic Field Detection Engine (CTE-FIX-03D)
  console.log(`[03C][START]\npageNumber: ${pageNumber}`);
  console.log(`[03C][ENGINE]\nHYBRID_DETECTION_ENGINE_CALLED = true`);
  console.log(`[03C][LEGACY_ENGINE]\nLEGACY_DETECTION_ENGINE_CALLED = false`);

  let autoCandidates: FieldGeometry[] = [];
  let totalRegionsCount = 0;
  let checkboxesCount = 0;
  let structuralOnlyCount = 0;
  let nonFillableGraphicsCount = 0;
  let unresolvedCount = 0;
  let unresolvedPotentialLabelsCount = 0;

  try {
    const hybridOutput = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines,
      rawRects,
      textItems,
      existingFields,
    });

    const hybridAuthoritative = hybridOutput.authoritativeFields;
    totalRegionsCount = hybridOutput.diagnostics.totalRegionsDetected;
    checkboxesCount = hybridOutput.diagnostics.checkboxesCount;
    structuralOnlyCount = hybridOutput.diagnostics.structuralOnlyCount;
    nonFillableGraphicsCount = hybridOutput.diagnostics.nonFillableGraphicsCount;
    unresolvedCount = hybridOutput.diagnostics.unresolvedCount;
    unresolvedPotentialLabelsCount = hybridOutput.diagnostics.unresolvedPotentialLabelsCount;

    // Combine native AcroForm annotations with Authoritative Hybrid Fields
    autoCandidates = [...acroformCandidates, ...hybridAuthoritative];
  } catch (hybridErr) {
    console.error(`[03D][HYBRID_ENGINE_ERROR] Hybrid detection pipeline failed on page ${pageNumber}:`, hybridErr);
    // Explicit diagnostic logging without silent fallback
  }

  // Evaluate each clustered proposal against existing fields (protection of confirmed/modified, memory of rejected)
  for (const cand of autoCandidates) {
    evaluateAndAddCandidate(cand);
  }

  // Final Diagnostics Summary
  const diagnostics: PageDetectionDiagnostics = {
    textItemsCount,
    annotationsCount,
    vectorCandidatesCount: rawLines.length + rawRects.length,
    labelCandidatesCount: textLayerCandidates.length,
    checkboxRadioCandidatesCount: checkboxesCount,
    candidatesRaw: totalRegionsCount,
    candidatesDeduplicated: autoCandidates.length,
    matchedExisting,
    newProposals: proposedFields.length,
    ignoredDuplicates,
    ignoredRejected,
    finalProposalsCount: proposedFields.length,
    rasterFallbackUsed,
    ocrFallbackUsed,
    rawOcrWordsCount,
    validOcrTextItemsCount,
    rawLinesCount: rawLines.length,
    rawRectsCount: rawRects.length,
    rawTextCount: textItems.length,
    rawCheckboxCount: checkboxesCount,
    rawTotalCount: rawLines.length + rawRects.length + textItems.length,
    clustersCount: totalRegionsCount,
    mergedCount: 0,
    filteredStructureCount: structuralOnlyCount + nonFillableGraphicsCount,
    filteredLowConfidenceCount: unresolvedCount,
    overDetectionSuspected: false,
    expectedStructuralRegionsCount: totalRegionsCount,
    uncoveredPlausibleRegionsCount: unresolvedPotentialLabelsCount,
    recoveryPassAddedCount: 0,
    underDetectionSuspected: unresolvedPotentialLabelsCount > 0,
  };

  console.log(`[AssistedFieldDetection Diagnostics Page ${pageNumber}]
RAW_LINES: ${diagnostics.rawLinesCount}
RAW_RECTS: ${diagnostics.rawRectsCount}
RAW_TEXT: ${diagnostics.rawTextCount}
RAW_CHECKBOX: ${diagnostics.rawCheckboxCount}
RAW_TOTAL: ${diagnostics.rawTotalCount}
CLUSTERS: ${diagnostics.clustersCount}
MERGED: ${diagnostics.mergedCount}
FILTERED_STRUCTURE: ${diagnostics.filteredStructureCount}
FILTERED_LOW_CONFIDENCE: ${diagnostics.filteredLowConfidenceCount}
RECOVERY_PASS_ADDED: ${diagnostics.recoveryPassAddedCount}
UNCOVERED_PLAUSIBLE: ${diagnostics.uncoveredPlausibleRegionsCount}
EXPECTED_STRUCTURAL: ${diagnostics.expectedStructuralRegionsCount}
FINAL_PROPOSALS: ${diagnostics.finalProposalsCount}
OVER_DETECTION_SUSPECTED: ${diagnostics.overDetectionSuspected ? 'YES' : 'NO'}
UNDER_DETECTION_SUSPECTED: ${diagnostics.underDetectionSuspected ? 'YES' : 'NO'}`);

  opts.onDiagnostics?.(diagnostics);

  return proposedFields;
}

/**
 * Full Runtime Diagnostic Trace Interface (CTE-FIX-02C).
 * Captures real browser data from PDF.js, text items, vector graphics, raster lines, and pipeline transformations.
 */
export interface PageRuntimeDiagnosticTrace {
  timestamp: string;
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
  const pageNumber = opts.pageNumber || pdfPage.pageNumber || 1;
  const viewport = pdfPage.getViewport({ scale: 1.0 });
  const pageWidthPt = viewport.width || 595.32;
  const pageHeightPt = viewport.height || 841.92;
  const existingFields = opts.existingFields || [];

  const discardedList: Array<{
    candidateId?: string;
    discardedAt: string;
    discardedReason: string;
    relevantValues: Record<string, any>;
  }> = [];

  const rawCandidatesList: Array<{
    id: string;
    type: string;
    bbox: { x: number; y: number; w: number; h: number };
    source: string;
    associatedLabel: string;
    confidence: number;
  }> = [];

  const traceSteps: Array<{
    step: string;
    description: string;
    counts: Record<string, any>;
    details?: any;
  }> = [];

  // 1. OperatorList Vector Graphics
  const vectorData = await extractVectorGraphics(pdfPage, pageWidthPt, pageHeightPt, viewport);
  traceSteps.push({
    step: 'extractVectorGraphics',
    description: 'Extracted vector lines and boxes from PDF OperatorList with viewport transform',
    counts: {
      vectorLines: vectorData.lines.length,
      vectorBoxes: vectorData.boxes.length,
    },
    details: {
      linesSample: vectorData.lines.slice(0, 5),
      boxesSample: vectorData.boxes.slice(0, 5),
    },
  });

  // Effective canvas for visual scanning and OCR fallback
  let effectiveCanvas = opts.canvasElement;
  if (!effectiveCanvas && typeof document !== 'undefined' && pdfPage.render) {
    try {
      effectiveCanvas = await renderPdfPageToCanvas(pdfPage, 2.0);
    } catch {
      // non-blocking
    }
  }

  // 2. Text Content Extraction (Native PDF or Local OCR Fallback)
  let rawItems: any[] = [];
  try {
    const textContent = await pdfPage.getTextContent();
    rawItems = (textContent.items || []).filter((it: any) => it.str && it.str.trim().length > 0) as any[];
  } catch (err: any) {
    discardedList.push({
      discardedAt: 'getTextContent',
      discardedReason: 'TEXT_EXTRACTION_ERROR',
      relevantValues: { error: err?.message },
    });
  }

  let textItems: Array<{
    x: number;
    yTop: number;
    w: number;
    h: number;
    str: string;
    rawTransform?: number[];
    fontName?: string;
  }> = [];

  if (rawItems.length > 0) {
    textItems = rawItems
      .map((item) => {
        const str = item.str.trim();
        const x = item.transform ? item.transform[4] : 0;
        const yBottom = item.transform ? item.transform[5] : 0;
        const w = item.width || 0;
        const h = item.height || (item.transform ? Math.abs(item.transform[0]) || Math.abs(item.transform[3]) : 10);
        const canonical = pdfRectFromNativePdf([x, yBottom, x + w, yBottom + h], pageHeightPt, viewport);
        return {
          x: canonical.xPt,
          yTop: canonical.yPt,
          w: canonical.widthPt,
          h: canonical.heightPt,
          str,
          rawTransform: item.transform,
          fontName: item.fontName,
        };
      })
      .filter((it) => it.x >= -2 && it.x < pageWidthPt + 2 && it.yTop >= -2 && it.yTop < pageHeightPt + 2);

    textItems.sort((a, b) => (Math.abs(a.yTop - b.yTop) < 6 ? a.x - b.x : a.yTop - b.yTop));

    traceSteps.push({
      step: 'getTextContent',
      description: 'Extracted raw text items transformed to canonical coordinates',
      counts: {
        rawItemsCount: rawItems.length,
        validTextItemsCount: textItems.length,
      },
      details: {
        textSample: textItems.slice(0, 10).map((t) => ({ str: t.str, x: t.x, y: t.yTop, w: t.w, h: t.h })),
      },
    });
  } else if (effectiveCanvas) {
    // OCR Extraction Fallback for Scanned / Raster Page
    let ocrWords: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
    let ocrConfidence = 0;

    try {
      if (opts.customOcrRunner) {
        const ocrRes = await opts.customOcrRunner(effectiveCanvas);
        ocrWords = ocrRes.words || [];
        ocrConfidence = ocrRes.confidence || 85;
        if (!ocrWords.length && (ocrRes.text || ocrRes.rawText)) {
          const raw = ocrRes.text || ocrRes.rawText || '';
          const cW = effectiveCanvas.width || pageWidthPt;
          const cH = effectiveCanvas.height || pageHeightPt;
          const lines = raw.split('\n').filter((l) => l.trim().length > 0);
          lines.forEach((lStr, lIdx) => {
            const toks = lStr.trim().split(/\s+/);
            let curX = 50;
            const curY = 80 + lIdx * 35;
            toks.forEach((tok) => {
              const tW = Math.max(16, tok.length * 8);
              ocrWords.push({
                text: tok,
                confidence: ocrRes.confidence || 85,
                bbox: {
                  x0: (curX / pageWidthPt) * cW,
                  y0: (curY / pageHeightPt) * cH,
                  x1: ((curX + tW) / pageWidthPt) * cW,
                  y1: ((curY + 14) / pageHeightPt) * cH,
                },
              });
              curX += tW + 8;
            });
          });
        }
      } else if (typeof window !== 'undefined' && effectiveCanvas.toDataURL) {
        const dataUrl = effectiveCanvas.toDataURL('image/png');
        if (dataUrl && dataUrl.startsWith('data:image/png')) {
          const arr = dataUrl.split(',');
          const bstr = atob(arr[1] || '');
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const file = new File([u8arr], `page-${pageNumber}-ocr.png`, { type: 'image/png' });
          const ocrRes = await analyzeDocumentImage(file);
          ocrWords = ocrRes.words || [];
          ocrConfidence = ocrRes.confidence;
        }
      }
    } catch (ocrErr: any) {
      discardedList.push({
        discardedAt: 'ocrExtraction',
        discardedReason: 'OCR_EXTRACTION_ERROR',
        relevantValues: { error: ocrErr?.message },
      });
    }

    const cWidth = effectiveCanvas.width || pageWidthPt;
    const cHeight = effectiveCanvas.height || pageHeightPt;

    const wordsConverted = ocrWords
      .filter((w) => w.text && w.text.trim().length > 0 && w.bbox)
      .map((w) => {
        const x = (w.bbox.x0 / cWidth) * pageWidthPt;
        const yTop = (w.bbox.y0 / cHeight) * pageHeightPt;
        const widthPt = ((w.bbox.x1 - w.bbox.x0) / cWidth) * pageWidthPt;
        const heightPt = ((w.bbox.y1 - w.bbox.y0) / cHeight) * pageHeightPt;
        return {
          x: Math.round(x * 10) / 10,
          yTop: Math.round(yTop * 10) / 10,
          w: Math.max(6, Math.round(widthPt * 10) / 10),
          h: Math.max(8, Math.round(heightPt * 10) / 10),
          str: w.text.trim(),
          fontName: 'ocr_recognized',
        };
      })
      .filter((it) => it.x >= -2 && it.x < pageWidthPt + 2 && it.yTop >= -2 && it.yTop < pageHeightPt + 2);

    wordsConverted.sort((a, b) => (Math.abs(a.yTop - b.yTop) < 6 ? a.x - b.x : a.yTop - b.yTop));

    const phrases: Array<{ x: number; yTop: number; w: number; h: number; str: string; fontName?: string }> = [];
    let currentPhrase: { x: number; yTop: number; w: number; h: number; str: string; fontName?: string } | null = null;

    for (const word of wordsConverted) {
      textItems.push(word);

      if (!currentPhrase) {
        currentPhrase = { ...word };
      } else {
        const isSameLine = Math.abs(word.yTop - currentPhrase.yTop) <= Math.max(6, currentPhrase.h * 0.5);
        const gapX = word.x - (currentPhrase.x + currentPhrase.w);
        if (isSameLine && gapX >= -2 && gapX <= 24) {
          currentPhrase.str = `${currentPhrase.str} ${word.str}`;
          currentPhrase.w = Math.round((word.x + word.w - currentPhrase.x) * 10) / 10;
          currentPhrase.h = Math.max(currentPhrase.h, word.h);
        } else {
          if (currentPhrase.str.includes(' ')) {
            phrases.push(currentPhrase);
          }
          currentPhrase = { ...word };
        }
      }
    }
    if (currentPhrase && currentPhrase.str.includes(' ')) {
      phrases.push(currentPhrase);
    }
    textItems.push(...phrases);

    traceSteps.push({
      step: 'ocrExtraction',
      description: 'Extracted OCR text items and word groupings from rendered canvas',
      counts: {
        rawOcrWordsCount: ocrWords.length,
        validOcrTextItemsCount: textItems.length,
        ocrConfidence,
      },
      details: {
        textSample: textItems.slice(0, 10).map((t) => ({ str: t.str, x: t.x, y: t.yTop, w: t.w, h: t.h })),
      },
    });
  }

  // 3. Raster/Visual Canvas Scan
  const rasterLines: Array<{ x1: number; y: number; x2: number; source: string }> = [];
  let scannedCanvasData: {
    lines: Array<{ x1: number; y: number; x2: number }>;
    boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
    verticalLines?: Array<{ x: number; y1: number; y2: number }>;
  } = { lines: [], boxes: [], verticalLines: [] };

  if (effectiveCanvas) {
    try {
      scannedCanvasData = detectVisualLinesFromCanvas(effectiveCanvas, pageWidthPt, pageHeightPt, textItems);
      for (const sl of scannedCanvasData.lines) {
        rasterLines.push({ ...sl, source: 'CANVAS' });
      }
      traceSteps.push({
        step: 'detectVisualLinesFromCanvas',
        description: 'Scanned rendered canvas for raster visual lines, vertical separators, and boxes',
        counts: {
          rasterLinesCount: scannedCanvasData.lines.length,
          rasterVerticalLinesCount: scannedCanvasData.verticalLines?.length || 0,
          rasterBoxesCount: scannedCanvasData.boxes.length,
          rasterCheckboxesCount: scannedCanvasData.boxes.filter((b) => b.isCheckbox).length,
        },
      });
    } catch (err: any) {
      discardedList.push({
        discardedAt: 'detectVisualLinesFromCanvas',
        discardedReason: 'CANVAS_SCAN_FAILED',
        relevantValues: { error: err?.message },
      });
    }
  }

  // 4. Run standard page detection with diagnostics feedback
  let lastDiagnostics: PageDetectionDiagnostics | undefined;
  const proposedFields = await detectFieldsOnPdfPage(pdfPage, pageNumber, existingFields, {
    canvasElement: effectiveCanvas || undefined,
    customOcrRunner: opts.customOcrRunner,
    onDiagnostics: (d) => {
      lastDiagnostics = d;
    },
  });

  // 5. Build raw candidates list for trace
  for (const box of vectorData.boxes) {
    rawCandidatesList.push({
      id: `vector-box-${box.x}-${box.y}`,
      type: box.isCheckbox ? 'CHECKBOX' : 'BOX_CELL',
      bbox: { x: box.x, y: box.y, w: box.w, h: box.h },
      source: 'VECTOR_BOX',
      associatedLabel: '',
      confidence: box.isCheckbox ? 0.95 : 0.85,
    });
  }

  for (const line of vectorData.lines) {
    rawCandidatesList.push({
      id: `vector-line-${line.x1}-${line.y}`,
      type: 'LINE_FIELD',
      bbox: { x: line.x1, y: line.y, w: line.x2 - line.x1, h: 20 },
      source: 'VECTOR_LINE',
      associatedLabel: '',
      confidence: 0.88,
    });
  }

  for (const box of scannedCanvasData.boxes) {
    rawCandidatesList.push({
      id: `raster-box-${box.x}-${box.y}`,
      type: box.isCheckbox ? 'CHECKBOX' : 'BOX_CELL',
      bbox: { x: box.x, y: box.y, w: box.w, h: box.h },
      source: 'RASTER_BOX',
      associatedLabel: '',
      confidence: box.isCheckbox ? 0.92 : 0.85,
    });
  }

  for (const line of scannedCanvasData.lines) {
    rawCandidatesList.push({
      id: `raster-line-${line.x1}-${line.y}`,
      type: 'LINE_FIELD',
      bbox: { x: line.x1, y: line.y, w: line.x2 - line.x1, h: 20 },
      source: 'RASTER_LINE',
      associatedLabel: '',
      confidence: 0.85,
    });
  }

  for (const pf of proposedFields) {
    rawCandidatesList.push({
      id: pf.fieldId,
      type: pf.fieldType,
      bbox: { x: pf.xPt, y: pf.yPt, w: pf.widthPt, h: pf.heightPt },
      source: pf.detectionSource || 'COMBINED',
      associatedLabel: pf.label,
      confidence: pf.confidence || 0.9,
    });
  }

  // 6. Record discarded reasons breakdown from clustering
  if (lastDiagnostics?.discardedReasons) {
    for (const [reason, count] of Object.entries(lastDiagnostics.discardedReasons)) {
      if (count > 0) {
        discardedList.push({
          candidateId: undefined,
          discardedAt: 'clusterAndRefineCandidates',
          discardedReason: reason,
          relevantValues: { count },
        });
      }
    }
  }

  traceSteps.push({
    step: 'fieldDiscriminationAndClustering',
    description: 'Applied semantic and geometric discrimination: label exclusion, static text filtering, and structure anchoring',
    counts: {
      rawTotalCount: lastDiagnostics?.rawTotalCount || 0,
      rawLinesCount: lastDiagnostics?.rawLinesCount || 0,
      rawRectsCount: lastDiagnostics?.rawRectsCount || 0,
      rawTextCount: lastDiagnostics?.rawTextCount || 0,
      rawCheckboxCount: lastDiagnostics?.rawCheckboxCount || 0,
      clustersCount: lastDiagnostics?.clustersCount || 0,
      mergedCount: lastDiagnostics?.mergedCount || 0,
      filteredStructureCount: lastDiagnostics?.filteredStructureCount || 0,
      filteredLowConfidenceCount: lastDiagnostics?.filteredLowConfidenceCount || 0,
      finalProposalsCount: proposedFields.length,
      overDetectionSuspected: lastDiagnostics?.overDetectionSuspected || false,
    },
    details: {
      discardedReasons: lastDiagnostics?.discardedReasons || {},
    },
  });

  const diagnosticTrace: PageRuntimeDiagnosticTrace = {
    timestamp: new Date().toISOString(),
    document: {
      modelId: opts.modelId || 'CUSTOM_PDF',
      modelName: opts.modelName || 'Documento Attivo',
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      viewport: {
        scale: viewport.scale || 1.0,
        rotation: viewport.rotation || 0,
        offsetX: viewport.offsetX || 0,
        offsetY: viewport.offsetY || 0,
        width: viewport.width,
        height: viewport.height,
        viewBox: viewport.viewBox,
        transform: viewport.transform,
      },
      rotation: (pdfPage as any).rotate || 0,
      mediaBox: (pdfPage as any).mediaBox || (pdfPage as any).view || null,
      cropBox: (pdfPage as any).cropBox || null,
      view: (pdfPage as any).view || null,
    },
    textItems: textItems.map((t) => ({
      text: t.str,
      x: t.x,
      y: t.yTop,
      width: t.w,
      height: t.h,
      rawTransform: t.rawTransform,
      fontName: t.fontName,
    })),
    vectorLines: vectorData.lines.map((l) => ({
      x1: l.x1,
      y1: l.y,
      x2: l.x2,
      y2: l.y,
      source: 'VECTOR',
    })),
    vectorBoxes: vectorData.boxes.map((b) => ({
      x: b.x,
      y: b.y,
      width: b.w,
      height: b.h,
      isCheckbox: b.isCheckbox,
      source: 'VECTOR',
    })),
    rasterVisualLines: rasterLines,
    rasterBoxes: scannedCanvasData.boxes.map((b) => ({
      x: b.x,
      y: b.y,
      width: b.w,
      height: b.h,
      isCheckbox: b.isCheckbox,
      source: 'CANVAS',
    })),
    rawCandidates: rawCandidatesList,
    pipelineTrace: {
      steps: traceSteps,
      discarded: discardedList,
    },
    finalProposedFields: proposedFields.map((f) => ({
      fieldId: f.fieldId,
      label: f.label,
      semanticKey: f.semanticKey,
      fieldType: f.fieldType,
      bbox: {
        xPt: f.xPt,
        yPt: f.yPt,
        widthPt: f.widthPt,
        heightPt: f.heightPt,
      },
      confidence: f.confidence,
      derivationMethod: f.derivationMethod,
      detectionSource: f.detectionSource,
      sourceCandidateIds: [f.fieldId],
    })),
  };

  return diagnosticTrace;
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
      let pageCanvas: HTMLCanvasElement | undefined;
      try {
        const textContent = await pageProxy.getTextContent();
        if ((!textContent.items || textContent.items.length === 0) && typeof document !== 'undefined' && pageProxy.render) {
          pageCanvas = await renderPdfPageToCanvas(pageProxy, 2.0);
        }
      } catch {
        // non-blocking
      }
      const protectedFields = targetPage.fields.filter((f) => {
        const prov = getFieldProvenance(f);
        return prov === 'USER_CONFIRMED' || prov === 'MANUAL_CREATED' || prov === 'NATIVE_FORM';
      });

      const detected = await detectFieldsOnPdfPage(pageProxy, pageNum, protectedFields, {
        canvasElement: pageCanvas,
      });

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
