/**
 * @license
 * PEI FACILE — Candidate Clustering, Over-Detection Reduction & Geometry Anchoring Engine (R08-R6)
 * Transforms raw candidates (lines, rects, text items, annotations) into conservative,
 * semantically plausible, structurally grounded fillable field proposals.
 *
 * Core principles:
 * 1. Physical Structure Grounding: Bboxes strictly match real compilable cell/line interiors.
 * 2. Label Exclusion: Prompt labels, section titles, and explanatory notes are strictly excluded from field bboxes.
 * 3. Two-Column Table Support: Side-by-side cells produce distinct fields rather than merged blobs.
 * 4. Recovery Pass: Plausible compilable regions missed in first pass are recovered without causing floods.
 * 5. Multisource Weighted Consensus: Physical vector bounds override fuzzy text heuristics.
 * 6. Under-detection and Over-detection diagnostics with root cause classification.
 */

import type {
  FieldGeometry,
  FieldDetectionSource,
  FieldBackgroundMode,
} from '../data/geometry/types';
import type { TemplateFieldType } from './templateSchemaTypes';
import { generateFieldId, suggestSemanticKey } from './semanticCatalog';
import {
  clampFieldToPageBounds,
  snapFieldToDetectedStructure,
  validateFieldGeometry,
  extractCellInteriorRect,
  calculateGeometryFitScore,
  type StructureAnchorType,
  type GeometryFitEvaluation,
} from '../data/geometry/geometryTransform';

export {
  snapFieldToDetectedStructure,
  validateFieldGeometry,
  extractCellInteriorRect,
  calculateGeometryFitScore,
  type StructureAnchorType,
  type GeometryFitEvaluation,
};

export interface RawLineCandidate {
  x1: number;
  y: number;
  x2: number;
  y2?: number;
  isVertical?: boolean;
  source?: 'VECTOR' | 'RASTER' | 'CANVAS' | 'VISUAL_SCAN';
}

export interface RawRectCandidate {
  x: number;
  y: number;
  w: number;
  h: number;
  isCheckbox?: boolean;
  source?: 'VECTOR' | 'RASTER' | 'CANVAS' | 'ANNOTATION';
}

export interface RawTextItem {
  x: number;
  yTop: number;
  w: number;
  h: number;
  str: string;
}

export type DiscardReason =
  | 'LOW_CONFIDENCE'
  | 'DUPLICATE'
  | 'TABLE_STRUCTURE'
  | 'MERGED'
  | 'GEOMETRY_SUSPECT'
  | 'OUT_OF_BOUNDS'
  | 'TOO_SMALL'
  | 'NO_LABEL'
  | 'HEADER_ONLY'
  | 'OTHER';

export interface CandidateClusteringDiagnostics {
  rawLinesCount: number;
  rawRectsCount: number;
  rawTextCount: number;
  rawCheckboxCount: number;
  rawTotalCount: number;
  clustersCount: number;
  mergedCount: number;
  filteredStructureCount: number;
  filteredLowConfidenceCount: number;
  finalProposalsCount: number;
  overDetectionSuspected: boolean;
  // R08-R6 Specific additions
  expectedStructuralRegionsCount: number;
  uncoveredPlausibleRegionsCount: number;
  recoveryPassAddedCount: number;
  underDetectionSuspected: boolean;
  discardedReasons: Record<DiscardReason, number>;
}

export interface ProcessCandidatesInput {
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  rawLines: RawLineCandidate[];
  rawRects: RawRectCandidate[];
  textItems: RawTextItem[];
  acroformCandidates: FieldGeometry[];
  textLayerCandidates: FieldGeometry[];
  existingFields: FieldGeometry[];
}

/**
 * Merges horizontally colinear segments with small gaps (< 16 pt).
 */
export function mergeColinearHorizontalLines(lines: RawLineCandidate[]): RawLineCandidate[] {
  if (lines.length <= 1) return [...lines];

  // Group lines by y-coordinate (tolerance 2.5 pt)
  const grouped: RawLineCandidate[][] = [];
  const sorted = [...lines].sort((a, b) => (Math.abs(a.y - b.y) <= 2.5 ? a.x1 - b.x1 : a.y - b.y));

  for (const line of sorted) {
    let placed = false;
    for (const group of grouped) {
      if (Math.abs(group[0].y - line.y) <= 2.5) {
        group.push(line);
        placed = true;
        break;
      }
    }
    if (!placed) {
      grouped.push([line]);
    }
  }

  const mergedLines: RawLineCandidate[] = [];

  for (const group of grouped) {
    group.sort((a, b) => a.x1 - b.x1);
    let current = { ...group[0] };

    for (let i = 1; i < group.length; i++) {
      const next = group[i];
      // If overlapping or gap is small (< 16 pt)
      if (next.x1 <= current.x2 + 16) {
        current.x2 = Math.max(current.x2, next.x2);
        current.x1 = Math.min(current.x1, next.x1);
      } else {
        mergedLines.push(current);
        current = { ...next };
      }
    }
    mergedLines.push(current);
  }

  return mergedLines;
}

/**
 * Finds groups of vertically stacked parallel lines that form a multiline narrative writing area.
 */
export function clusterMultilineAreas(
  lines: RawLineCandidate[],
  textItems: RawTextItem[]
): {
  multilineClusters: { lines: RawLineCandidate[]; prompt?: RawTextItem }[];
  remainingLines: RawLineCandidate[];
} {
  if (lines.length < 2) {
    return { multilineClusters: [], remainingLines: [...lines] };
  }

  // Filter lines with plausible fillable width (>= 60 pt)
  const sortedLines = [...lines]
    .filter((l) => l.x2 - l.x1 >= 60)
    .sort((a, b) => a.y - b.y);

  const usedLineIndices = new Set<number>();
  const multilineClusters: { lines: RawLineCandidate[]; prompt?: RawTextItem }[] = [];

  for (let i = 0; i < sortedLines.length; i++) {
    if (usedLineIndices.has(i)) continue;

    const baseLine = sortedLines[i];
    const cluster: RawLineCandidate[] = [baseLine];
    const clusterIndices: number[] = [i];

    let lastY = baseLine.y;
    const baseWidth = baseLine.x2 - baseLine.x1;

    for (let j = i + 1; j < sortedLines.length; j++) {
      if (usedLineIndices.has(j)) continue;

      const cand = sortedLines[j];
      const dy = cand.y - lastY;

      // Vertical distance between ruled lines in narrative area: 10 to 36 pt
      if (dy > 36) {
        // Gap too large to be adjacent ruled line in same block
        break;
      }

      if (dy >= 9) {
        const candWidth = cand.x2 - cand.x1;
        const x1Diff = Math.abs(cand.x1 - baseLine.x1);
        const x2Diff = Math.abs(cand.x2 - baseLine.x2);
        const widthRatio = Math.min(candWidth, baseWidth) / Math.max(candWidth, baseWidth);

        // Lines must share alignment (margins within 30 pt, similar length)
        if ((x1Diff <= 30 && x2Diff <= 35) || widthRatio >= 0.70) {
          // Check if cand has its own distinct prompt on the left
          // (meaning it is a separate labeled form row, not an unlabelled continuation line)
          const candHasOwnPrompt = textItems.some(
            (it) =>
              Math.abs(it.yTop + it.h - cand.y) < 14 &&
              it.x + it.w <= cand.x1 + 12 &&
              cand.x1 - (it.x + it.w) < 55
          );

          if (candHasOwnPrompt) {
            // Cannot be a continuation line of previous prompt
            break;
          }

          cluster.push(cand);
          clusterIndices.push(j);
          lastY = cand.y;
        }
      }
    }

    // A multiline area must have at least 2 stacked parallel lines
    if (cluster.length >= 2) {
      clusterIndices.forEach((idx) => usedLineIndices.add(idx));

      // Find nearby prompt above the top line of the cluster
      const topY = cluster[0].y;
      const leftX = Math.min(...cluster.map((l) => l.x1));
      const rightX = Math.max(...cluster.map((l) => l.x2));

      const prompt = textItems.find(
        (it) =>
          topY - (it.yTop + it.h) >= -2 &&
          topY - (it.yTop + it.h) <= 35 &&
          it.x >= leftX - 40 &&
          it.x <= rightX
      );

      multilineClusters.push({ lines: cluster, prompt });
    }
  }

  const remainingLines = lines.filter((_, idx) => {
    const originalLine = lines[idx];
    return !multilineClusters.some((c) =>
      c.lines.some(
        (cl) =>
          Math.abs(cl.y - originalLine.y) < 2 &&
          Math.abs(cl.x1 - originalLine.x1) < 2 &&
          Math.abs(cl.x2 - originalLine.x2) < 2
      )
    );
  });

  return { multilineClusters, remainingLines };
}

/**
 * Distinguishes table grid borders from fillable lines.
 * Structural borders (outer table boundaries, vertical headers, grid dividers)
 * are filtered out so they do not produce separate line fields.
 */
export function filterTableStructureLines(
  lines: RawLineCandidate[],
  boxes: RawRectCandidate[],
  pageWidthPt: number
): {
  filteredLines: RawLineCandidate[];
  structuralLinesCount: number;
} {
  let structuralCount = 0;

  // 1. Filter out vertical lines (structural column borders/dividers)
  const nonVerticalLines = lines.filter((l) => {
    if (l.isVertical || Math.abs(l.x2 - l.x1) < 4) {
      structuralCount++;
      return false;
    }
    return true;
  });

  // 2. Identify grid bounding boxes or table outlines
  const tableBoxes = boxes.filter((b) => b.w >= 100 && b.h >= 30 && !b.isCheckbox);

  // 3. Detect multi-row grid structures: horizontal lines sharing x1 and x2
  const lineGroupsBySpan = new Map<string, RawLineCandidate[]>();
  for (const line of nonVerticalLines) {
    const key = `${Math.round(line.x1 / 15) * 15}_${Math.round(line.x2 / 15) * 15}`;
    const grp = lineGroupsBySpan.get(key) || [];
    grp.push(line);
    lineGroupsBySpan.set(key, grp);
  }

  // If lines form regular grid lines across the width with spacing > 24 pt, they are table grid rows!
  const gridLineSet = new Set<RawLineCandidate>();
  for (const [, grp] of lineGroupsBySpan.entries()) {
    if (grp.length >= 3) {
      grp.sort((a, b) => a.y - b.y);
      let isTableGrid = true;
      for (let i = 1; i < grp.length; i++) {
        const dy = grp[i].y - grp[i - 1].y;
        if (dy < 18 || dy > 120) {
          isTableGrid = false;
          break;
        }
      }
      if (isTableGrid && grp[1].y - grp[0].y >= 24) {
        for (const l of grp) {
          gridLineSet.add(l);
        }
      }
    }
  }

  const filteredLines = nonVerticalLines.filter((line) => {
    const len = line.x2 - line.x1;

    // A. Page-wide header/footer dividing rules
    if (len >= pageWidthPt - 80 && (line.y <= 65 || line.y >= 780)) {
      structuralCount++;
      return false;
    }

    // B. Part of a detected table grid
    if (gridLineSet.has(line)) {
      structuralCount++;
      return false;
    }

    // C. Lines that lie on or inside a table box as internal row/column dividers
    for (const tbox of tableBoxes) {
      const isInsideOrOnBorder =
        line.y >= tbox.y - 3 &&
        line.y <= tbox.y + tbox.h + 3 &&
        line.x1 >= tbox.x - 8 &&
        line.x2 <= tbox.x + tbox.w + 8;
      if (isInsideOrOnBorder) {
        structuralCount++;
        return false;
      }
    }

    // D. Micro lines shorter than 35 pt
    if (len < 35) {
      structuralCount++;
      return false;
    }

    return true;
  });

  return { filteredLines, structuralLinesCount: structuralCount };
}

/**
 * Calculates IoU (Intersection over Union) of two bounding boxes.
 */
export function calculateIoU(
  a: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  b: { xPt: number; yPt: number; widthPt: number; heightPt: number }
): number {
  const x1 = Math.max(a.xPt, b.xPt);
  const y1 = Math.max(a.yPt, b.yPt);
  const x2 = Math.min(a.xPt + a.widthPt, b.xPt + b.widthPt);
  const y2 = Math.min(a.yPt + a.heightPt, b.yPt + b.heightPt);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.widthPt * a.heightPt;
  const areaB = b.widthPt * b.heightPt;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Checks if two fields occupy substantially the same logical compilation area.
 */
export function areFieldsSameArea(
  a: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  b: { xPt: number; yPt: number; widthPt: number; heightPt: number }
): boolean {
  const iou = calculateIoU(a, b);
  if (iou >= 0.38) return true;

  // Check containment
  const x1 = Math.max(a.xPt, b.xPt);
  const y1 = Math.max(a.yPt, b.yPt);
  const x2 = Math.min(a.xPt + a.widthPt, b.xPt + b.widthPt);
  const y2 = Math.min(a.yPt + a.heightPt, b.yPt + b.heightPt);

  if (x2 > x1 && y2 > y1) {
    const interArea = (x2 - x1) * (y2 - y1);
    const minArea = Math.min(a.widthPt * a.heightPt, b.widthPt * b.heightPt);
    if (minArea > 0 && interArea / minArea >= 0.55) return true;
  }

  // Check same horizontal line band and nearby center
  const centerAX = a.xPt + a.widthPt / 2;
  const centerAY = a.yPt + a.heightPt / 2;
  const centerBX = b.xPt + b.widthPt / 2;
  const centerBY = b.yPt + b.heightPt / 2;
  const dist = Math.hypot(centerAX - centerBX, centerAY - centerBY);

  if (dist <= 18) return true;

  if (Math.abs(a.yPt - b.yPt) <= 6 && Math.abs(centerAX - centerBX) <= 24) {
    return true;
  }

  return false;
}

/**
 * Master Pipeline for R08-R6:
 * A. Raw Candidate Collection & Normalization
 * B. Table Structure Filtering (Vertical & Margin lines)
 * C. Multiline ruled areas clustering
 * D. Large text boxes / cells clustering (with Two-Column Table Support & Header Exclusion)
 * E. Checkbox extraction
 * F. Short fillable line extraction (with prompt requirement)
 * G. Text layer candidates
 * H. RECOVERY PASS: Recovers unmapped plausible structural cells/lines
 * I. Structure Snapping & Outlier Validation
 * J. Weighted Bbox Consensus & Multisource Fusion
 * K. Protection of Existing Fields & Idempotence
 * L. Diagnostics Summary & Soft-limit Safety
 */
export function clusterAndRefineCandidates(
  input: ProcessCandidatesInput
): {
  proposedFields: FieldGeometry[];
  diagnostics: CandidateClusteringDiagnostics;
} {
  const {
    pageNumber,
    pageWidthPt,
    pageHeightPt,
    rawLines,
    rawRects,
    textItems,
    acroformCandidates,
    textLayerCandidates,
    existingFields,
  } = input;

  // Diagnostics counters & reason tracking
  const discardedReasons: Record<DiscardReason, number> = {
    LOW_CONFIDENCE: 0,
    DUPLICATE: 0,
    TABLE_STRUCTURE: 0,
    MERGED: 0,
    GEOMETRY_SUSPECT: 0,
    OUT_OF_BOUNDS: 0,
    TOO_SMALL: 0,
    NO_LABEL: 0,
    HEADER_ONLY: 0,
    OTHER: 0,
  };

  let rawLinesCount = rawLines.length;
  let rawRectsCount = rawRects.length;
  let rawTextCount = textItems.length;
  let rawCheckboxCount = rawRects.filter((r) => r.isCheckbox).length;
  const rawTotalCount = rawLinesCount + rawRectsCount + rawTextCount + acroformCandidates.length;

  let clustersCount = 0;
  let mergedCount = 0;
  let filteredStructureCount = 0;
  let filteredLowConfidenceCount = 0;
  let recoveryPassAddedCount = 0;

  // Step 1: Horizontal colinear segment merging
  const colinearMergedLines = mergeColinearHorizontalLines(rawLines);
  const colinearMergedDelta = Math.max(0, rawLines.length - colinearMergedLines.length);
  mergedCount += colinearMergedDelta;
  discardedReasons.MERGED += colinearMergedDelta;

  // Step 2: Table structure filtering (filter table grid borders & vertical columns)
  const { filteredLines, structuralLinesCount } = filterTableStructureLines(
    colinearMergedLines,
    rawRects,
    pageWidthPt
  );
  filteredStructureCount += structuralLinesCount;
  discardedReasons.TABLE_STRUCTURE += structuralLinesCount;

  // Step 3: Multiline Narrative Ruled Areas Clustering
  const { multilineClusters, remainingLines } = clusterMultilineAreas(filteredLines, textItems);
  clustersCount += multilineClusters.length;

  const candidatePool: Array<FieldGeometry & { anchorType?: StructureAnchorType }> = [];

  // Add AcroForm candidates (already high confidence)
  for (const acro of acroformCandidates) {
    candidatePool.push({ ...acro, anchorType: 'RECT_ANCHOR' });
  }

  // Process Multiline Clusters -> EXACTLY 1 MULTILINE field per cluster
  for (const cluster of multilineClusters) {
    const lines = cluster.lines;
    const multilineDelta = lines.length - 1;
    mergedCount += multilineDelta;
    discardedReasons.MERGED += multilineDelta;

    const minX = Math.min(...lines.map((l) => l.x1));
    const maxX = Math.max(...lines.map((l) => l.x2));
    const rawWidthPt = maxX - minX;
    const widthPt = Math.max(80, Math.round(rawWidthPt * 10) / 10);

    const firstLineY = lines[0].y;
    const lastLineY = lines[lines.length - 1].y;

    // Exclude prompt text if present
    let yPt = Math.max(0, Math.round((firstLineY - 18) * 10) / 10);
    if (cluster.prompt) {
      yPt = Math.round((cluster.prompt.yTop + cluster.prompt.h + 2) * 10) / 10;
    }
    const heightPt = Math.max(28, Math.round((lastLineY + 4 - yPt) * 10) / 10);

    const promptText = cluster.prompt ? cluster.prompt.str.replace(/:$/, '').trim() : '';
    const suggestion = suggestSemanticKey(promptText || 'Note e osservazioni');

    const multilineField: FieldGeometry & { anchorType?: StructureAnchorType } = {
      fieldId: generateFieldId(),
      label: suggestion.suggestedLabel || promptText || 'Area di testo multilinea',
      semanticKey: null,
      suggestedSemanticKey: suggestion.semanticKey,
      suggestedLabel: suggestion.suggestedLabel,
      fieldType: 'TEXT_LONG',
      backgroundMode: 'OPAQUE_WHITE',
      calibrationStatus: 'PROPOSED',
      pageNumber,
      xPt: minX,
      yPt,
      widthPt,
      heightPt,
      anchorText: promptText || 'Multiline cluster',
      derivationMethod: 'VECTOR_BOUNDARY',
      detectionSource: cluster.prompt ? 'COMBINED' : 'GEOMETRY',
      confidence: cluster.prompt ? 0.94 : 0.88,
      status: 'REVIEW_REQUIRED',
      anchorType: 'MULTILINE_REGION_ANCHOR',
    };

    candidatePool.push(multilineField);
  }

  // Step 4: Rectangular Boxes & Cells (With Two-Column Table Support & Header Exclusion)
  const consumedLinesInBoxes = new Set<RawLineCandidate>();

  for (const box of rawRects) {
    if (box.isCheckbox) continue;

    // Plausible box/cell dimensions (w >= 40, h >= 18)
    if (box.w >= 40 && box.h >= 18) {
      // Find prompt inside or directly above box
      const prompt = textItems.find(
        (it) =>
          (it.x >= box.x - 6 && it.x + it.w <= box.x + box.w + 12 && it.yTop >= box.y - 2 && it.yTop + it.h <= box.y + box.h + 2) ||
          (box.y - (it.yTop + it.h) >= -2 && box.y - (it.yTop + it.h) < 26 && Math.abs(it.x - box.x) < 50)
      );

      // Extract inner compilation geometry with label exclusion
      const interior = extractCellInteriorRect(box, prompt, 2);

      // Check if this is a pure header cell
      if (interior.isHeaderOnly) {
        discardedReasons.HEADER_ONLY++;
        continue;
      }

      // Swallow any remaining lines falling inside this box
      for (const line of remainingLines) {
        if (
          line.y >= box.y &&
          line.y <= box.y + box.h &&
          line.x1 >= box.x - 5 &&
          line.x2 <= box.x + box.w + 5
        ) {
          consumedLinesInBoxes.add(line);
          mergedCount++;
          discardedReasons.MERGED++;
        }
      }

      // If prompt is not directly inside, search for a column header right above (table column case)
      let labelText = prompt ? prompt.str.replace(/:$/, '').trim() : '';
      if (!labelText) {
        const colHeader = textItems.find(
          (it) =>
            box.y - (it.yTop + it.h) >= 0 &&
            box.y - (it.yTop + it.h) < 40 &&
            it.x >= box.x - 10 &&
            it.x <= box.x + box.w
        );
        if (colHeader) {
          labelText = colHeader.str.replace(/:$/, '').trim();
        }
      }

      const suggestion = suggestSemanticKey(labelText || 'Area di compilazione');

      candidatePool.push({
        fieldId: generateFieldId(),
        label: suggestion.suggestedLabel || labelText || 'Area di compilazione',
        semanticKey: null,
        suggestedSemanticKey: suggestion.semanticKey,
        suggestedLabel: suggestion.suggestedLabel,
        fieldType: box.h > 45 ? 'TEXT_LONG' : suggestion.suggestedFieldType || 'TEXT_SHORT',
        backgroundMode: 'OPAQUE_WHITE',
        calibrationStatus: 'PROPOSED',
        pageNumber,
        xPt: interior.xPt,
        yPt: interior.yPt,
        widthPt: interior.widthPt,
        heightPt: interior.heightPt,
        anchorText: prompt ? prompt.str : labelText || 'Visual Box',
        derivationMethod: 'TABLE_CELL',
        detectionSource: prompt ? 'COMBINED' : 'GEOMETRY',
        confidence: prompt ? 0.92 : 0.85,
        status: 'REVIEW_REQUIRED',
        anchorType: 'CELL_ANCHOR',
      });
      clustersCount++;
    }
  }

  // Step 5: Checkboxes
  for (const box of rawRects) {
    if (box.isCheckbox || (box.w >= 10 && box.w <= 24 && box.h >= 10 && box.h <= 24)) {
      rawCheckboxCount++;
      const rightLabel = textItems.find(
        (it) => Math.abs(it.yTop - box.y) < 8 && it.x > box.x + box.w && it.x - (box.x + box.w) < 60
      );
      const choiceLabel = rightLabel ? rightLabel.str.trim() : 'Scelta opzione';

      candidatePool.push({
        fieldId: generateFieldId(),
        label: choiceLabel.startsWith('Scelta') ? choiceLabel : `Scelta: ${choiceLabel}`,
        semanticKey: null,
        suggestedSemanticKey: null,
        suggestedLabel: choiceLabel,
        fieldType: 'SINGLE_CHOICE',
        backgroundMode: 'TRANSPARENT',
        calibrationStatus: 'PROPOSED',
        pageNumber,
        xPt: box.x,
        yPt: box.y,
        widthPt: box.w,
        heightPt: box.h,
        anchorText: choiceLabel,
        derivationMethod: 'VECTOR_BOUNDARY',
        detectionSource: 'GEOMETRY',
        confidence: 0.88,
        status: 'REVIEW_REQUIRED',
        anchorType: 'RECT_ANCHOR',
      });
    }
  }

  // Step 6: Single Short Fields from Remaining Isolated Lines
  const candidateSingleLines = remainingLines.filter((l) => !consumedLinesInBoxes.has(l));

  for (const line of candidateSingleLines) {
    const lineLen = line.x2 - line.x1;
    if (lineLen < 35) {
      filteredLowConfidenceCount++;
      discardedReasons.TOO_SMALL++;
      continue;
    }

    // Find nearby prompt to the left or above
    const promptLeft = textItems.find(
      (it) =>
        Math.abs(it.yTop + it.h - line.y) < 16 &&
        it.x <= line.x1 + 12 &&
        it.x + it.w < line.x2 &&
        it.x + it.w > line.x1 - 50
    );

    const promptAbove = textItems.find(
      (it) =>
        line.y - (it.yTop + it.h) >= 0 &&
        line.y - (it.yTop + it.h) < 24 &&
        Math.abs(it.x - line.x1) < 50
    );

    const prompt = promptLeft || promptAbove;

    // Reject unlabelled isolated lines to avoid spam
    if (!prompt) {
      filteredLowConfidenceCount++;
      discardedReasons.NO_LABEL++;
      continue;
    }

    const label = prompt.str.replace(/:$/, '').trim();
    const suggestion = suggestSemanticKey(label);
    const isDate = /data|nato\s+il|lì/i.test(label);

    let fieldX = Math.round(line.x1 * 10) / 10;
    let fieldW = Math.round(lineLen * 10) / 10;
    let fieldY = Math.max(0, Math.round((line.y - 18) * 10) / 10);

    if (promptLeft) {
      fieldX = Math.max(line.x1, Math.round((promptLeft.x + promptLeft.w + 4) * 10) / 10);
      fieldW = Math.max(30, Math.round((line.x2 - fieldX) * 10) / 10);
    } else if (promptAbove) {
      fieldY = Math.max(0, Math.max(Math.round((line.y - 18) * 10) / 10, Math.round((promptAbove.yTop + promptAbove.h + 2) * 10) / 10));
    }

    candidatePool.push({
      fieldId: generateFieldId(),
      label: suggestion.suggestedLabel || label,
      semanticKey: null,
      suggestedSemanticKey: suggestion.semanticKey,
      suggestedLabel: suggestion.suggestedLabel,
      fieldType: isDate ? 'DATE' : suggestion.suggestedFieldType || 'TEXT_SHORT',
      backgroundMode: 'OPAQUE_WHITE',
      calibrationStatus: 'PROPOSED',
      pageNumber,
      xPt: fieldX,
      yPt: fieldY,
      widthPt: fieldW,
      heightPt: 20,
      anchorText: prompt.str,
      derivationMethod: 'VECTOR_BOUNDARY',
      detectionSource: 'COMBINED',
      confidence: 0.89,
      status: 'REVIEW_REQUIRED',
      anchorType: 'LINE_ANCHOR',
    });
  }

  // Step 7: Add Text Layer Candidates (Compound patterns, explicit labels)
  for (const tcand of textLayerCandidates) {
    candidatePool.push({ ...tcand, anchorType: 'LABEL_ANCHOR' });
  }

  // Count structural regions expected on page
  const expectedStructuralRegionsCount =
    rawRects.filter((r) => !r.isCheckbox && r.w >= 40 && r.h >= 18).length +
    multilineClusters.length +
    textLayerCandidates.length;

  // Step 8: RECOVERY PASS (R08-R6 Under-Detection Correction)
  // Check for uncovered plausible structural regions that were missed
  let uncoveredPlausibleRegionsCount = 0;

  for (const rect of rawRects) {
    if (rect.isCheckbox) continue;
    if (rect.w < 40 || rect.h < 18) continue;

    // Check if this rectangle is already covered by a candidate in candidatePool
    const isCovered = candidatePool.some((cand) => {
      const iou = calculateIoU(cand, { xPt: rect.x, yPt: rect.y, widthPt: rect.w, heightPt: rect.h });
      return iou > 0.25;
    });

    if (!isCovered) {
      uncoveredPlausibleRegionsCount++;

      // Find nearby prompt inside, above, or left
      const prompt = textItems.find(
        (it) =>
          (it.x >= rect.x - 10 && it.x + it.w <= rect.x + rect.w + 15 && it.yTop >= rect.y - 4 && it.yTop + it.h <= rect.y + rect.h + 4) ||
          (rect.y - (it.yTop + it.h) >= -2 && rect.y - (it.yTop + it.h) < 35 && Math.abs(it.x - rect.x) < 50)
      );

      const interior = extractCellInteriorRect(rect, prompt, 2);

      if (!interior.isHeaderOnly) {
        let labelText = prompt ? prompt.str.replace(/:$/, '').trim() : '';
        if (!labelText) {
          // Column header check
          const colHeader = textItems.find(
            (it) =>
              rect.y - (it.yTop + it.h) >= 0 &&
              rect.y - (it.yTop + it.h) < 45 &&
              it.x >= rect.x - 10 &&
              it.x <= rect.x + rect.w
          );
          if (colHeader) {
            labelText = colHeader.str.replace(/:$/, '').trim();
          }
        }

        const suggestion = suggestSemanticKey(labelText || 'Area di compilazione');

        candidatePool.push({
          fieldId: generateFieldId(),
          label: suggestion.suggestedLabel || labelText || 'Area di compilazione (recuperata)',
          semanticKey: null,
          suggestedSemanticKey: suggestion.semanticKey,
          suggestedLabel: suggestion.suggestedLabel,
          fieldType: rect.h > 45 ? 'TEXT_LONG' : suggestion.suggestedFieldType || 'TEXT_SHORT',
          backgroundMode: 'OPAQUE_WHITE',
          calibrationStatus: 'PROPOSED',
          pageNumber,
          xPt: interior.xPt,
          yPt: interior.yPt,
          widthPt: interior.widthPt,
          heightPt: interior.heightPt,
          anchorText: prompt ? prompt.str : labelText || 'Recovered Region',
          derivationMethod: 'TABLE_CELL',
          detectionSource: prompt ? 'COMBINED' : 'GEOMETRY',
          confidence: prompt ? 0.90 : 0.82,
          status: 'REVIEW_REQUIRED',
          anchorType: 'CELL_ANCHOR',
        });

        recoveryPassAddedCount++;
      }
    }
  }

  // Also check remaining lines with relaxed prompt distance in recovery pass
  for (const line of candidateSingleLines) {
    if (consumedLinesInBoxes.has(line)) continue;
    const lineLen = line.x2 - line.x1;
    if (lineLen < 45) continue;

    // Check if covered
    const isLineCovered = candidatePool.some((cand) => {
      return (
        Math.abs(cand.yPt + cand.heightPt - line.y) <= 8 &&
        line.x2 > cand.xPt &&
        line.x1 < cand.xPt + cand.widthPt
      );
    });

    if (!isLineCovered) {
      // Look for relaxed prompt to the left (up to 70 pt) or above (up to 30 pt)
      const relaxedPrompt = textItems.find(
        (it) =>
          (Math.abs(it.yTop + it.h - line.y) < 20 && it.x + it.w <= line.x1 + 25 && line.x1 - (it.x + it.w) < 70) ||
          (line.y - (it.yTop + it.h) >= 0 && line.y - (it.yTop + it.h) < 32 && Math.abs(it.x - line.x1) < 60)
      );

      if (relaxedPrompt) {
        uncoveredPlausibleRegionsCount++;
        const label = relaxedPrompt.str.replace(/:$/, '').trim();
        const suggestion = suggestSemanticKey(label);
        const isDate = /data|nato\s+il|lì/i.test(label);

        let fieldX = Math.max(line.x1, Math.round((relaxedPrompt.x + relaxedPrompt.w + 4) * 10) / 10);
        let fieldW = Math.max(30, Math.round((line.x2 - fieldX) * 10) / 10);
        let fieldY = Math.max(0, Math.round((line.y - 18) * 10) / 10);

        candidatePool.push({
          fieldId: generateFieldId(),
          label: suggestion.suggestedLabel || label,
          semanticKey: null,
          suggestedSemanticKey: suggestion.semanticKey,
          suggestedLabel: suggestion.suggestedLabel,
          fieldType: isDate ? 'DATE' : suggestion.suggestedFieldType || 'TEXT_SHORT',
          backgroundMode: 'OPAQUE_WHITE',
          calibrationStatus: 'PROPOSED',
          pageNumber,
          xPt: fieldX,
          yPt: fieldY,
          widthPt: fieldW,
          heightPt: 20,
          anchorText: relaxedPrompt.str,
          derivationMethod: 'VECTOR_BOUNDARY',
          detectionSource: 'COMBINED',
          confidence: 0.86,
          status: 'REVIEW_REQUIRED',
          anchorType: 'LINE_ANCHOR',
        });
        recoveryPassAddedCount++;
      }
    }
  }

  // Step 9: Structure Snapping & Outlier Validation & Geometry Fit Scoring
  const snappedPool: FieldGeometry[] = [];

  for (const cand of candidatePool) {
    const snapped =
      cand.anchorType === 'CELL_ANCHOR'
        ? cand
        : snapFieldToDetectedStructure(cand, filteredLines, rawRects, 6);
    const validation = validateFieldGeometry(snapped, pageWidthPt, pageHeightPt);

    if (!validation.isValid) {
      filteredLowConfidenceCount++;
      if (validation.reason === 'OUT_OF_BOUNDS') {
        discardedReasons.OUT_OF_BOUNDS++;
      } else if (validation.reason === 'FIELD_TOO_SMALL' || validation.reason === 'MULTILINE_TOO_SMALL') {
        discardedReasons.TOO_SMALL++;
      } else {
        discardedReasons.GEOMETRY_SUSPECT++;
      }
      continue;
    }

    const clamped = clampFieldToPageBounds(snapped, pageWidthPt, pageHeightPt);
    if (!clamped) {
      filteredLowConfidenceCount++;
      discardedReasons.OUT_OF_BOUNDS++;
      continue;
    }

    // Calculate Geometry Fit Score
    const fitEval = calculateGeometryFitScore(clamped, {
      pageWidthPt,
      pageHeightPt,
      anchorType: cand.anchorType,
    });

    if (fitEval.isSuspect && fitEval.score < 0.45) {
      filteredLowConfidenceCount++;
      discardedReasons.GEOMETRY_SUSPECT++;
      continue;
    }

    snappedPool.push(clamped);
  }

  // Step 10: Multisource Weighted Consensus Fusion & Deduplication
  const consolidatedPool: FieldGeometry[] = [];

  for (const cand of snappedPool) {
    const existingMatch = consolidatedPool.find((target) => areFieldsSameArea(cand, target));

    if (existingMatch) {
      // Fuse into COMBINED
      existingMatch.detectionSource = 'COMBINED';
      existingMatch.confidence = Math.max(existingMatch.confidence || 0.8, cand.confidence || 0.8);

      // Weighted Consensus on Geometry:
      // If cand comes from a physical cell / rect and existing is from line/text, inherit physical rect bounds
      if (cand.derivationMethod === 'TABLE_CELL' && existingMatch.derivationMethod !== 'TABLE_CELL') {
        existingMatch.xPt = cand.xPt;
        existingMatch.yPt = cand.yPt;
        existingMatch.widthPt = cand.widthPt;
        existingMatch.heightPt = cand.heightPt;
        existingMatch.derivationMethod = 'TABLE_CELL';
      }

      // If the incoming candidate has a more specific semantic suggestion, keep it
      if (!existingMatch.suggestedSemanticKey && cand.suggestedSemanticKey) {
        existingMatch.suggestedSemanticKey = cand.suggestedSemanticKey;
        existingMatch.suggestedLabel = cand.suggestedLabel;
        existingMatch.label = cand.label;
      }
      mergedCount++;
      discardedReasons.DUPLICATE++;
    } else {
      consolidatedPool.push(cand);
    }
  }

  // Step 11: Check against existing fields (Idempotence, never duplicate confirmed/modified/rejected)
  let filteredAgainstExisting: FieldGeometry[] = [];

  for (const cand of consolidatedPool) {
    let duplicate = false;
    for (const ef of existingFields) {
      if (ef.pageNumber === pageNumber && areFieldsSameArea(cand, ef)) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      filteredAgainstExisting.push(cand);
    } else {
      discardedReasons.DUPLICATE++;
    }
  }

  // Step 12: Soft-Limit Diagnostic & Phase 2 Refinement
  let overDetectionSuspected = rawTotalCount > 40 || filteredAgainstExisting.length > 30;

  if (filteredAgainstExisting.length > 30) {
    // Trigger Phase 2 aggressive clustering & refinement
    const phase2: FieldGeometry[] = [];

    // Sort top-to-bottom
    filteredAgainstExisting.sort((a, b) => a.yPt - b.yPt);

    for (let i = 0; i < filteredAgainstExisting.length; i++) {
      const f = filteredAgainstExisting[i];

      // If this is a generic single line field and the next one is close vertically with similar width -> merge into MULTILINE
      if (f.fieldType === 'TEXT_SHORT' && !f.suggestedSemanticKey) {
        const next = filteredAgainstExisting[i + 1];
        if (
          next &&
          next.fieldType === 'TEXT_SHORT' &&
          next.yPt - f.yPt <= 35 &&
          next.yPt > f.yPt &&
          Math.abs(next.xPt - f.xPt) <= 25 &&
          Math.abs(next.widthPt - f.widthPt) <= 30
        ) {
          // Merge
          f.fieldType = 'TEXT_LONG';
          f.heightPt = Math.round((next.yPt + next.heightPt - f.yPt) * 10) / 10;
          f.label = f.label || 'Area di testo multilinea';
          mergedCount++;
          discardedReasons.MERGED++;
          i++; // Skip next
        }
      }

      // Drop unanchored low-confidence generic proposals
      if (f.confidence && f.confidence < 0.85 && !f.suggestedSemanticKey && f.label.includes('Riga')) {
        filteredLowConfidenceCount++;
        discardedReasons.LOW_CONFIDENCE++;
        continue;
      }

      phase2.push(f);
    }

    filteredAgainstExisting = phase2;

    if (filteredAgainstExisting.length > 35) {
      overDetectionSuspected = true;
      console.warn(
        `[R08-R6] OVER_DETECTION_SUSPECTED on Page ${pageNumber}: ${filteredAgainstExisting.length} fields after phase 2.`
      );
      // Prioritize high-confidence and semantically recognized fields
      filteredAgainstExisting.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      // Soft cap to prevent blowing up the tree to 100+ items
      const pruned = filteredAgainstExisting.slice(0, 32);
      const droppedCount = filteredAgainstExisting.length - pruned.length;
      filteredLowConfidenceCount += droppedCount;
      discardedReasons.LOW_CONFIDENCE += droppedCount;
      filteredAgainstExisting = pruned;
    }
  }

  // Under-detection check
  const underDetectionSuspected =
    uncoveredPlausibleRegionsCount >= 3 &&
    filteredAgainstExisting.length < Math.max(6, expectedStructuralRegionsCount * 0.6);

  const diagnostics: CandidateClusteringDiagnostics = {
    rawLinesCount,
    rawRectsCount,
    rawTextCount,
    rawCheckboxCount,
    rawTotalCount,
    clustersCount,
    mergedCount,
    filteredStructureCount,
    filteredLowConfidenceCount,
    finalProposalsCount: filteredAgainstExisting.length,
    overDetectionSuspected,
    expectedStructuralRegionsCount,
    uncoveredPlausibleRegionsCount,
    recoveryPassAddedCount,
    underDetectionSuspected,
    discardedReasons,
  };

  return {
    proposedFields: filteredAgainstExisting,
    diagnostics,
  };
}
