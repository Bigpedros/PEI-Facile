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
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
} from '../data/geometry/geometryTransform';
import {
  clusterAndRefineCandidates,
  type RawLineCandidate,
  type RawRectCandidate,
} from './fieldCandidateClustering';

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
function isLabelPrompt(str: string): boolean {
  const clean = str.trim();
  if (clean.length < 2 || clean.length > 80) return false;
  if (clean.endsWith(':')) return true;

  // Standard Italian form prompt tokens
  const promptRegex = /\b(?:anno\s+scolastico|a\.s\.|bambin[oa]|alunn[oa]|alliev[oa]|student(?:e|essa)|cognome|nome|nominativo|codice|c\.f\.|nat[oa]|luogo|comune|classe|sez(?:ione)?|plesso|sede|scuola|istitut[o]|circolo|dirigente|docente|insegnante|profilo|diagnosi|redatto|verbale|delibera|glo|approvaz|firma|ore|oepac|aec|scadenza|rivedibilit[aà]|interventi|obiettivi)\b/i;
  if (promptRegex.test(clean)) return true;

  // Semantic suggestion match
  const suggestion = suggestSemanticKey(clean);
  if (suggestion.semanticKey !== null) return true;

  return false;
}

/**
 * Extracts vector lines and boxes from PDF OperatorList if available.
 */
async function extractVectorGraphics(
  pdfPage: any,
  pageWidthPt: number,
  pageHeightPt: number
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
              const x1 = Math.min(currentX, nextX);
              const x2 = Math.max(currentX, nextX);
              const yTop = pageHeightPt - currentY;

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
            const rx = Math.min(p1x, p2x);
            const wPt = Math.abs(p2x - p1x);
            const hPt = Math.abs(p2y - p1y);
            const yTop = pageHeightPt - Math.max(p1y, p2y);

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
        const rx = Math.min(p1x, p2x);
        const wPt = Math.abs(p2x - p1x);
        const hPt = Math.abs(p2y - p1y);
        const yTop = pageHeightPt - Math.max(p1y, p2y);
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
  } catch (err) {
    // Non-fatal if operator list cannot be parsed
  }

  return { lines, boxes };
}

/**
 * Detects visual lines and boxes from a canvas element (or fallback visual structural analysis).
 * Scans rows for dark pixels to find printed compilation lines and rectangular bounding boxes.
 */
export function detectVisualLinesFromCanvas(
  canvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number
): {
  lines: Array<{ x1: number; y: number; x2: number }>;
  boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }>;
} {
  const lines: Array<{ x1: number; y: number; x2: number }> = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number; isCheckbox: boolean }> = [];

  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { lines, boxes };

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return { lines, boxes };

    const scaleX = width / pageWidthPt;
    const scaleY = height / pageHeightPt;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const minLineLenPx = Math.round(35 * scaleX);
    const stepY = Math.max(1, Math.round(2 * scaleY));

    // Scan horizontal lines: sequences of dark pixels with light background
    for (let py = 10; py < height - 10; py += stepY) {
      let startX = -1;
      for (let px = 10; px < width - 10; px += 2) {
        const idx = (py * width + px) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const isDark = a > 120 && (0.299 * r + 0.587 * g + 0.114 * b) < 140;

        if (isDark) {
          if (startX === -1) startX = px;
        } else {
          if (startX !== -1) {
            const len = px - startX;
            if (len >= minLineLenPx) {
              const x1Pt = Math.round((startX / scaleX) * 10) / 10;
              const x2Pt = Math.round((px / scaleX) * 10) / 10;
              const yPt = Math.round((py / scaleY) * 10) / 10;
              lines.push({ x1: x1Pt, y: yPt, x2: x2Pt });
            }
            startX = -1;
          }
        }
      }
      if (startX !== -1 && width - 10 - startX >= minLineLenPx) {
        lines.push({
          x1: Math.round((startX / scaleX) * 10) / 10,
          y: Math.round((py / scaleY) * 10) / 10,
          x2: Math.round(((width - 10) / scaleX) * 10) / 10,
        });
      }
    }
  } catch {
    // Non-fatal if canvas pixels cannot be accessed
  }

  return { lines, boxes };
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
  const vectorData = await extractVectorGraphics(pdfPage, pageWidthPt, pageHeightPt);
  vectorCandidatesCount = vectorData.lines.length + vectorData.boxes.length;
  for (const vl of vectorData.lines) {
    rawLines.push({ x1: vl.x1, y: vl.y, x2: vl.x2, source: 'VECTOR' });
  }
  for (const vb of vectorData.boxes) {
    rawRects.push({ x: vb.x, y: vb.y, w: vb.w, h: vb.h, isCheckbox: vb.isCheckbox, source: 'VECTOR' });
  }

  // 3. Extract Text Layer
  let rawItems: any[] = [];
  try {
    const textContent = await pdfPage.getTextContent();
    rawItems = (textContent.items || []).filter((it: any) => it.str && it.str.trim().length > 0) as any[];
    textItemsCount = rawItems.length;
  } catch {
    // Text layer might be absent in scanned documents
  }

  // Normalize text items to top-down coordinates
  const textItems = rawItems
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
      };
    })
    .filter((it) => it.x >= -2 && it.x < pageWidthPt + 2 && it.yTop >= -2 && it.yTop < pageHeightPt + 2);

  // Sort text items visually top-to-bottom, left-to-right
  textItems.sort((a, b) => (Math.abs(a.yTop - b.yTop) < 6 ? a.x - b.x : a.yTop - b.yTop));

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
      labelCandidatesCount++;
      const cleanLabel = str.replace(/:$/, '').trim();
      const suggestion = suggestSemanticKey(cleanLabel);

      // Check if this is a date field
      const isDatePrompt = /data|nato\s+il|roma,\s*lì|data\s+verifica/i.test(cleanLabel);

      // 1. Look for matching vector line to the right on the same line band
      const matchingVectorLineRight = vectorData.lines.find(
        (vl) => Math.abs(vl.y - (item.yTop + item.h)) < 10 && vl.x2 > item.x + item.w
      );

      // 2. Look for matching vector line directly BELOW the label (multi-line or section box)
      const matchingVectorLineBelow = vectorData.lines.find(
        (vl) =>
          vl.y > item.yTop + item.h &&
          vl.y <= item.yTop + item.h + 30 &&
          vl.x1 <= item.x + 30 &&
          vl.x2 >= item.x + item.w * 0.4
      );

      // 3. Look for separate underline/dots text item to the right
      const matchingTextUnderline = textItems.find(
        (it) => it !== item && Math.abs(it.yTop - item.yTop) < 8 && it.x >= item.x + item.w - 4 && /[_—\.]{3,}/.test(it.str)
      );

      // 4. Look for adjacent text item on the same horizontal line (e.g. "Classe: [___] Sezione: [___]")
      const nextItemOnSameLine = textItems.find(
        (it) => it !== item && Math.abs(it.yTop - item.yTop) < 8 && it.x > item.x + item.w
      );

      let xField = Math.round((item.x + item.w + 6) * 10) / 10;
      let yField = Math.max(0, Math.round((item.yTop - 3) * 10) / 10);
      let widthField = isDatePrompt ? 110 : 150;
      let heightField = suggestion.suggestedFieldType === 'TEXT_LONG' ? 55 : 22;
      let bgMode: FieldBackgroundMode = 'TRANSPARENT';
      let confidence = suggestion.confidence || 0.82;
      let derivationMethod: FieldGeometry['derivationMethod'] = 'TEXT_ANCHOR';
      let detectionSource: FieldDetectionSource = 'TEXT_LAYER';

      if (matchingVectorLineRight) {
        xField = Math.round(Math.max(item.x + item.w + 4, matchingVectorLineRight.x1) * 10) / 10;
        widthField = Math.max(50, Math.round((matchingVectorLineRight.x2 - xField) * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.94;
        derivationMethod = 'VECTOR_BOUNDARY';
        detectionSource = 'COMBINED';
      } else if (matchingVectorLineBelow) {
        xField = Math.round(matchingVectorLineBelow.x1 * 10) / 10;
        yField = Math.round((item.yTop + item.h + 2) * 10) / 10;
        widthField = Math.max(80, Math.round((matchingVectorLineBelow.x2 - xField) * 10) / 10);
        heightField = Math.max(22, Math.round((matchingVectorLineBelow.y - yField + 4) * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.93;
        derivationMethod = 'VECTOR_BOUNDARY';
        detectionSource = 'COMBINED';
      } else if (matchingTextUnderline) {
        xField = Math.round(Math.max(item.x + item.w + 4, matchingTextUnderline.x) * 10) / 10;
        widthField = Math.max(50, Math.round(matchingTextUnderline.w * 10) / 10);
        bgMode = 'OPAQUE_WHITE';
        confidence = 0.92;
        detectionSource = 'TEXT_LAYER';
      } else if (nextItemOnSameLine) {
        const rightLimit = nextItemOnSameLine.x - 6;
        widthField = Math.max(45, Math.round((rightLimit - xField) * 10) / 10);
        bgMode = suggestBackgroundMode({ xPt: xField, yPt: yField, widthPt: widthField, heightPt: heightField }, textItems);
      } else {
        const rightLimit = pageWidthPt - 30;
        if (xField + 50 > pageWidthPt) {
          // Label is near the right edge: position field below the label if there is vertical space
          xField = Math.max(20, item.x);
          yField = Math.round((item.yTop + item.h + 2) * 10) / 10;
          widthField = Math.min(240, Math.max(40, Math.round((pageWidthPt - xField - 20) * 10) / 10));
          bgMode = suggestBackgroundMode({ xPt: xField, yPt: yField, widthPt: widthField, heightPt: heightField }, textItems);
        } else {
          widthField = Math.min(260, Math.max(40, Math.round((rightLimit - xField) * 10) / 10));
          if (xField + widthField > pageWidthPt - 10) {
            widthField = Math.round((pageWidthPt - 10 - xField) * 10) / 10;
          }
          bgMode = suggestBackgroundMode({ xPt: xField, yPt: yField, widthPt: widthField, heightPt: heightField }, textItems);
        }
      }

      if (widthField >= 40) {
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
          status: 'REVIEW_REQUIRED',
        });
      }
    }
  }

  // 6. Vector and Raster Visual Detection (Lines and Boxes across whole page)
  if (opts.canvasElement) {
    try {
      const scanned = detectVisualLinesFromCanvas(opts.canvasElement, pageWidthPt, pageHeightPt);
      if (scanned.lines.length > 0 || scanned.boxes.length > 0) {
        rasterFallbackUsed = true;
        for (const sl of scanned.lines) {
          rawLines.push({ x1: sl.x1, y: sl.y, x2: sl.x2, source: 'CANVAS' });
        }
        for (const sb of scanned.boxes) {
          rawRects.push({ x: sb.x, y: sb.y, w: sb.w, h: sb.h, isCheckbox: sb.isCheckbox, source: 'CANVAS' });
        }
      }
    } catch {
      // Ignore canvas access errors
    }
  }

  // 7. Master Candidate Clustering, Over-detection Reduction & Field Segmentation Refinement
  const { proposedFields: clusteredFields, diagnostics: clusteringDiagnostics } = clusterAndRefineCandidates({
    pageNumber,
    pageWidthPt,
    pageHeightPt,
    rawLines,
    rawRects,
    textItems,
    acroformCandidates,
    textLayerCandidates,
    existingFields,
  });

  // Evaluate each clustered proposal against existing fields (protection of confirmed/modified, memory of rejected)
  for (const cand of clusteredFields) {
    evaluateAndAddCandidate(cand);
  }

  // Final Diagnostics Summary
  const diagnostics: PageDetectionDiagnostics = {
    textItemsCount,
    annotationsCount,
    vectorCandidatesCount: rawLines.length + rawRects.length,
    labelCandidatesCount: textLayerCandidates.length,
    checkboxRadioCandidatesCount: clusteringDiagnostics.rawCheckboxCount,
    candidatesRaw: clusteringDiagnostics.rawTotalCount,
    candidatesDeduplicated: clusteredFields.length,
    matchedExisting,
    newProposals: proposedFields.length,
    ignoredDuplicates,
    ignoredRejected,
    finalProposalsCount: proposedFields.length,
    rasterFallbackUsed,
    ocrFallbackUsed,
    rawLinesCount: clusteringDiagnostics.rawLinesCount,
    rawRectsCount: clusteringDiagnostics.rawRectsCount,
    rawTextCount: clusteringDiagnostics.rawTextCount,
    rawCheckboxCount: clusteringDiagnostics.rawCheckboxCount,
    rawTotalCount: clusteringDiagnostics.rawTotalCount,
    clustersCount: clusteringDiagnostics.clustersCount,
    mergedCount: clusteringDiagnostics.mergedCount,
    filteredStructureCount: clusteringDiagnostics.filteredStructureCount,
    filteredLowConfidenceCount: clusteringDiagnostics.filteredLowConfidenceCount,
    overDetectionSuspected: clusteringDiagnostics.overDetectionSuspected,
    expectedStructuralRegionsCount: clusteringDiagnostics.expectedStructuralRegionsCount,
    uncoveredPlausibleRegionsCount: clusteringDiagnostics.uncoveredPlausibleRegionsCount,
    recoveryPassAddedCount: clusteringDiagnostics.recoveryPassAddedCount,
    underDetectionSuspected: clusteringDiagnostics.underDetectionSuspected,
    discardedReasons: clusteringDiagnostics.discardedReasons,
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
      const detected = await detectFieldsOnPdfPage(pageProxy, pageNum, targetPage.fields);

      if (detected.length > 0) {
        targetPage.fields.push(...detected);
        totalProposed += detected.length;
      }
    } catch (err) {
      console.warn(`Detection on page ${pageNum} encountered warning:`, err);
    }

    // Yield to event loop to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { pages: updatedPages, totalProposed };
}
