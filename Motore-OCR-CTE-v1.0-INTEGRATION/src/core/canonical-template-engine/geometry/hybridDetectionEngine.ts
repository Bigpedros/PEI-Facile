/**
 * @license
 * OCR-CTE — Hybrid Geometric + Heuristic Field Detection Engine
 * Explicit, controlled and hierarchical collaboration between:
 * 1. GEOMETRY: identifies physical observable structures (CLOSED_CELL, UNDERLINE, CHECKBOX, MULTILINE_STRUCTURE, OPEN_STRUCTURE, NON_FILLABLE_SHAPE).
 * 2. OCR: extracts raw text items and bounding boxes.
 * 3. HEURISTICS: determines what structures represent and if they are compilable (FILLABLE_FIELD, EMPTY_CELL, PARTIAL_CELL, UNDERLINE_FIELD, CHECKBOX, STATIC_CELL, HEADER_CELL, STRUCTURAL_ONLY, NON_FILLABLE_GRAPHIC, UNRESOLVED).
 * 4. CTE: assigns semantic keys and canonical template mappings.
 *
 * Strict Architectural Rules:
 * - Bbox MUST come from physical geometry, NOT from text labels.
 * - White space alone is NOT a field (UNO SPAZIO BIANCO NON È UN CAMPO).
 * - Two horizontal lines without side borders do NOT automatically form a closed cell (DUE LINEE NON CREANO AUTOMATICAMENTE UNA CELLA).
 * - SPATIAL_EMPTY_REGION is an auxiliary helper, NOT an autonomous FieldGeometry generator.
 * - Strong empty closed cells produce EMPTY_CELL fields even if UNASSOCIATED (do NOT drop empty cells!).
 * - Labels without geometry produce UNRESOLVED_POTENTIAL_LABEL for diagnostics and NO FieldGeometry.
 * - Strict pageNumber coherence throughout every phase.
 */

import type {
  FieldGeometry,
  LabelAssociationMethod,
  GeometricExtractionSource,
  FieldBackgroundMode,
} from '../../../data/geometry/types';
import type { RawLineCandidate, RawRectCandidate, RawTextItem } from '../../fieldCandidateClustering';
import { generateFieldId, suggestSemanticKey } from '../../semanticCatalog';
import { isExplicitPrompt } from '../../../data/geometry/geometryTransform';

function looksLikePromptText(value: string): boolean {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (isExplicitPrompt(text)) return true;
  const letters = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  // OCR often appends checkbox-like noise after a printed colon (for example: "Label: |)").
  // A colon after meaningful alphabetic text is still strong prompt evidence.
  return letters >= 3 && /:/.test(text);
}

function cleanObservedLabel(value: string): string {
  return (value || '')
    .replace(/^\s*(?:\[\s*_?\s*\]|\(\s*\)|\|\)|1\)|l\)|□|☐)\s*/i, '')
    .replace(/\s*(?:\[\s*_?\s*\]|\|\)|1\)|l\)|□|☐)\s*$/i, '')
    .replace(/[:;]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type GeometricRegionType =
  | 'CLOSED_CELL'
  | 'UNDERLINE'
  | 'CHECKBOX'
  | 'PARTIAL_CELL_SOURCE'
  | 'MULTILINE_STRUCTURE'
  | 'OPEN_STRUCTURE'
  | 'NON_FILLABLE_SHAPE';

export type HeuristicClassification =
  | 'FILLABLE_FIELD'
  | 'EMPTY_CELL'
  | 'PARTIAL_CELL'
  | 'UNDERLINE_FIELD'
  | 'CHECKBOX'
  | 'STATIC_CELL'
  | 'HEADER_CELL'
  | 'STRUCTURAL_ONLY'
  | 'NON_FILLABLE_GRAPHIC'
  | 'UNRESOLVED';

export interface GeometricRegion {
  id: string;
  pageNumber: number;
  sourceBBox: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  geometryType: GeometricRegionType;
  geometryConfidence: number;
  physicalEvidence: string;
  rawLines?: RawLineCandidate[];
  rawRect?: RawRectCandidate;
  containsText?: RawTextItem[];
}

export interface UnresolvedPotentialLabel {
  label: string;
  pageNumber: number;
  bbox: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  reason: 'NO_PHYSICAL_GEOMETRY';
}

export interface HybridDetectionResult {
  region: GeometricRegion;
  classification: HeuristicClassification;
  labelAssociationMethod: LabelAssociationMethod;
  associatedLabel?: string;
  labelConfidence: number;
  fieldTypeSuggestion?: string;
  heuristicConfidence: number;
  semanticConfidence?: number;
  semanticKey?: string | null;
  fieldGeometry?: FieldGeometry | null;
}

export interface RunHybridDetectionInput {
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  rawLines: RawLineCandidate[];
  rawRects: RawRectCandidate[];
  textItems: RawTextItem[];
  existingFields?: FieldGeometry[];
}

export interface HybridDetectionPipelineOutput {
  results: HybridDetectionResult[];
  authoritativeFields: FieldGeometry[];
  unresolvedPotentialLabels: UnresolvedPotentialLabel[];
  diagnostics: {
    totalRegionsDetected: number;
    fillableFieldsCount: number;
    emptyCellsCount: number;
    partialCellsCount: number;
    underlineFieldsCount: number;
    checkboxesCount: number;
    headerCellsCount: number;
    structuralOnlyCount: number;
    nonFillableGraphicsCount: number;
    unresolvedCount: number;
    unresolvedPotentialLabelsCount: number;
  };
}

/**
 * Normalizes slightly slanted lines (calculating meanCoordinate for horizontal/vertical).
 */
export function normalizeLineCandidate(line: RawLineCandidate): RawLineCandidate {
  const x1 = line.x1;
  const x2 = line.x2;
  const y1 = line.y;
  const y2 = line.y2 !== undefined ? line.y2 : line.y;

  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);

  const rawSlope = dx > 0 ? (y2 - y1) / dx : 999;
  const isVert = dy > dx * 2 || line.isVertical === true;
  const meanCoordinate = isVert ? (x1 + x2) / 2 : (y1 + y2) / 2;

  return {
    ...line,
    y: Math.round((isVert ? y1 : meanCoordinate) * 10) / 10,
    isVertical: isVert,
    lineStart: { x: x1, y: y1 },
    lineEnd: { x: x2, y: y2 },
    rawSlope: Math.round(rawSlope * 1000) / 1000,
    meanCoordinate: Math.round(meanCoordinate * 10) / 10,
  };
}

/**
 * Identifies physical observable geometric regions on a page.
 */
export function extractGeometricRegions(input: {
  pageNumber: number;
  pageWidthPt?: number;
  rawLines: RawLineCandidate[];
  rawRects: RawRectCandidate[];
  textItems: RawTextItem[];
}): GeometricRegion[] {
  const { pageNumber, rawLines, rawRects, textItems } = input;
  const estimatedPageWidth = input.pageWidthPt || Math.max(1, ...rawLines.map((l) => Math.max(l.x1, l.x2)), ...rawRects.map((r) => r.x + r.w), ...textItems.map((t) => t.x + t.w));
  const regions: GeometricRegion[] = [];

  // Enforce strict pageNumber
  const pageTextItems = textItems;
  const pageTextHeights = pageTextItems.map((t) => t.h).filter((h) => h >= 4 && h <= 120).sort((a, b) => a - b);
  const pageMedianTextHeight = pageTextHeights.length ? pageTextHeights[Math.floor(pageTextHeights.length / 2)] : 18;
  const minClosedCellHeight = Math.max(14, pageMedianTextHeight * 0.78);
  const minClosedCellWidth = Math.max(30, pageMedianTextHeight * 1.35);

  // 1. Process Rectangles
  for (const rect of rawRects) {
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;

    // A. Checkbox: trust only rectangles already validated by the raster/vector primitive layer.
    // Size alone is insufficient: glyph fragments and circle arcs can be small and square-ish.
    if (rect.isCheckbox === true) {
      const minCheckboxSide = Math.max(8, pageMedianTextHeight * 0.45);
      if (Math.min(rect.w, rect.h) < minCheckboxSide) {
        // Tiny square fragments can survive raster primitive validation on noisy scans.
        // Keep them out of authoritative checkbox geometry when they are far below
        // the page's normal text scale.
        continue;
      }
      regions.push({
        id: `geom_chk_${pageNumber}_${Math.round(left)}_${Math.round(top)}`,
        pageNumber,
        sourceBBox: { left, top, right, bottom },
        geometryType: 'CHECKBOX',
        geometryConfidence: 0.95,
        physicalEvidence: 'PHYSICAL_CHECKBOX_SQUARE',
        rawRect: rect,
      });
      continue;
    }

    // B. Non-fillable graphic (circle/stamp/logo)
    if (rect.w >= 35 && rect.w <= 200 && rect.h >= 35 && rect.h <= 200) {
      const ratio = rect.w / rect.h;
      if (ratio >= 0.85 && ratio <= 1.15) {
        if ((rect as any).isCircle || (rect as any).isStamp || (rect as any).type === 'CIRCLE') {
          regions.push({
            id: `geom_graphic_${pageNumber}_${Math.round(left)}_${Math.round(top)}`,
            pageNumber,
            sourceBBox: { left, top, right, bottom },
            geometryType: 'NON_FILLABLE_SHAPE',
            geometryConfidence: 0.90,
            physicalEvidence: 'CIRCULAR_GRAPHIC_OR_STAMP',
            rawRect: rect,
          });
          continue;
        }
      }
    }

    // C. Closed Cell (4 vector/raster edges)
    if (rect.w >= minClosedCellWidth && rect.h >= minClosedCellHeight) {
      // Raster table extraction may return both an outer row/container rectangle and
      // its atomic child cells. A partitioned container is structural, not one giant
      // editable field. Prefer the smallest physically bounded cells.
      const childRects = rawRects.filter((other) => {
        if (other === rect || other.isCheckbox) return false;
        const contained = other.x >= left - 3 && other.y >= top - 3 &&
          other.x + other.w <= right + 3 && other.y + other.h <= bottom + 3;
        const meaningfullySmaller = other.w <= rect.w * 0.82 || other.h <= rect.h * 0.72;
        const meaningfulArea = other.w >= minClosedCellWidth * 0.75 && other.h >= minClosedCellHeight * 0.75;
        return contained && meaningfullySmaller && meaningfulArea;
      });
      const interiorVerticals = rawLines.filter((line) => {
        const n = normalizeLineCandidate(line);
        if (!n.isVertical) return false;
        const x = n.meanCoordinate ?? n.x1;
        const y1 = Math.min(n.lineStart?.y ?? n.y, n.lineEnd?.y ?? n.y2 ?? n.y);
        const y2 = Math.max(n.lineStart?.y ?? n.y, n.lineEnd?.y ?? n.y2 ?? n.y);
        const overlap = Math.max(0, Math.min(bottom, y2) - Math.max(top, y1));
        return x > left + Math.max(8, rect.w * 0.05) && x < right - Math.max(8, rect.w * 0.05) &&
          overlap / Math.max(1, rect.h) >= 0.58;
      });
      const partitionedContainer = childRects.length >= 2 || interiorVerticals.length >= 1;
      if (partitionedContainer) {
        regions.push({
          id: `geom_partition_${pageNumber}_${Math.round(left)}_${Math.round(top)}`,
          pageNumber,
          sourceBBox: { left, top, right, bottom },
          geometryType: 'OPEN_STRUCTURE',
          geometryConfidence: 0.94,
          physicalEvidence: 'PARTITIONED_TABLE_CONTAINER',
          rawRect: rect,
        });
        continue;
      }

      // OCR boxes on raster forms can touch/cross a printed border by a few points.
      // Assign text to a cell by center ownership or substantial bbox overlap.
      const insideText = pageTextItems.filter((it) => {
        const itRight = it.x + it.w, itBottom = it.yTop + it.h;
        const cx = it.x + it.w / 2, cy = it.yTop + it.h / 2;
        const centerInside = cx >= left - 2 && cx <= right + 2 && cy >= top - 2 && cy <= bottom + 2;
        const overlapW = Math.max(0, Math.min(right, itRight) - Math.max(left, it.x));
        const overlapH = Math.max(0, Math.min(bottom, itBottom) - Math.max(top, it.yTop));
        const overlapRatio = (overlapW * overlapH) / Math.max(1, it.w * it.h);
        return centerInside || overlapRatio >= 0.58;
      });

      const isMultiline = rect.h >= 45;

      regions.push({
        id: `geom_cell_${pageNumber}_${Math.round(left)}_${Math.round(top)}`,
        pageNumber,
        sourceBBox: { left, top, right, bottom },
        geometryType: isMultiline ? 'MULTILINE_STRUCTURE' : 'CLOSED_CELL',
        geometryConfidence: 0.92,
        physicalEvidence: isMultiline ? 'CLOSED_MULTILINE_RECTANGLE' : 'CLOSED_FOUR_BORDER_CELL',
        rawRect: rect,
        containsText: insideText,
      });
    }
  }

  // 2. Process Lines
  const normalizedLines = rawLines.map(normalizeLineCandidate);
  const verticalLines = normalizedLines.filter((l) => l.isVertical);
  const dottedHorizontalLines = normalizedLines.filter((l) => !l.isVertical && l.source === 'RASTER_DOTTED' && l.x2 - l.x1 >= 25);
  const rawHorizontalLines = normalizedLines.filter((l) => !l.isVertical && l.source !== 'RASTER_DOTTED' && l.x2 - l.x1 >= 25);

  // Raster scans frequently emit several nearly-coincident rows for one printed line
  // because of stroke thickness / anti-aliasing. Collapse those rows before any
  // semantic interpretation so one physical underline cannot become 3-5 fields.
  const textHeights = pageTextItems.map((t) => t.h).filter((h) => h >= 4 && h <= 80).sort((a, b) => a - b);
  const medianTextHeight = textHeights.length ? textHeights[Math.floor(textHeights.length / 2)] : 18;
  const sameStrokeTolerance = Math.max(5, Math.min(12, medianTextHeight * 0.30));
  const horizontalLines: RawLineCandidate[] = [];
  for (const line of [...rawHorizontalLines].sort((a, b) => a.y - b.y || a.x1 - b.x1)) {
    let merged = false;
    for (let i = horizontalLines.length - 1; i >= 0; i--) {
      const prev = horizontalLines[i];
      if (line.y - prev.y > sameStrokeTolerance) break;
      const overlap = Math.max(0, Math.min(prev.x2, line.x2) - Math.max(prev.x1, line.x1));
      const minLen = Math.max(1, Math.min(prev.x2 - prev.x1, line.x2 - line.x1));
      const gap = Math.max(0, Math.max(prev.x1, line.x1) - Math.min(prev.x2, line.x2));
      const bridgeGap = Math.max(18, Math.min(60, medianTextHeight * 1.35));
      const samePhysicalStroke = overlap / minLen >= 0.72 || gap <= bridgeGap;
      if (Math.abs(prev.y - line.y) <= sameStrokeTolerance && samePhysicalStroke) {
        const prevLen = prev.x2 - prev.x1;
        const lineLen = line.x2 - line.x1;
        prev.x1 = Math.min(prev.x1, line.x1);
        prev.x2 = Math.max(prev.x2, line.x2);
        prev.y = Math.round(((prev.y * prevLen + line.y * lineLen) / Math.max(1, prevLen + lineLen)) * 10) / 10;
        prev.y2 = prev.y;
        merged = true;
        break;
      }
    }
    if (!merged) horizontalLines.push({ ...line, y2: line.y });
  }

  const intersectionTolerance = Math.max(4, Math.min(12, medianTextHeight * 0.28));
  const verticalIntersections = (line: RawLineCandidate): number => verticalLines.filter((v) => {
    const vx = v.x1;
    const vy1 = Math.min(v.y, v.y2 ?? v.y);
    const vy2 = Math.max(v.y, v.y2 ?? v.y);
    return vx >= line.x1 - intersectionTolerance && vx <= line.x2 + intersectionTolerance &&
      line.y >= vy1 - intersectionTolerance && line.y <= vy2 + intersectionTolerance;
  }).length;

  // Detect open structures (two parallel horizontal lines without side borders)
  for (let i = 0; i < horizontalLines.length - 1; i++) {
    const l1 = horizontalLines[i];
    const l2 = horizontalLines[i + 1];

    const dy = Math.abs(l2.y - l1.y);
    if (dy >= 18 && dy <= 120) {
      const xOverlapStart = Math.max(l1.x1, l2.x1);
      const xOverlapEnd = Math.min(l1.x2, l2.x2);
      const overlapWidth = xOverlapEnd - xOverlapStart;

      if (overlapWidth >= 60) {
        // Check if there are vertical side borders enclosing these two lines
        const hasLeftSide = rawRects.some(
          (r) => Math.abs(r.x - xOverlapStart) < 12 && r.y <= l1.y + 4 && r.y + r.h >= l2.y - 4
        );
        const hasRightSide = rawRects.some(
          (r) => Math.abs(r.x + r.w - xOverlapEnd) < 12 && r.y <= l1.y + 4 && r.y + r.h >= l2.y - 4
        );

        if (!hasLeftSide && !hasRightSide) {
          // Open structure! Two lines with whitespace and no side borders.
          regions.push({
            id: `geom_open_${pageNumber}_${Math.round(xOverlapStart)}_${Math.round(l1.y)}`,
            pageNumber,
            sourceBBox: {
              left: xOverlapStart,
              top: Math.min(l1.y, l2.y),
              right: xOverlapEnd,
              bottom: Math.max(l1.y, l2.y),
            },
            geometryType: 'OPEN_STRUCTURE',
            geometryConfidence: 0.85,
            physicalEvidence: 'TWO_PARALLEL_LINES_NO_SIDE_BORDERS',
            rawLines: [l1, l2],
          });
        }
      }
    }
  }

  // Process individual underline candidates (horizontal lines not consumed by closed cells)
  const minUnderlineLength = Math.max(40, medianTextHeight * 2.1);
  for (const line of horizontalLines) {
    const len = line.x2 - line.x1;
    if (len >= minUnderlineLength) {
      // A real form may contain an underline INSIDE a table cell (dates, references,
      // signatures, etc.). Do not discard every line merely because it lies inside
      // a rectangle. Suppress only strokes that are effectively the cell's own
      // top/bottom border.
      const containingRects = rawRects.filter(
        (r) =>
          line.y >= r.y - 2 &&
          line.y <= r.y + r.h + 2 &&
          line.x1 >= r.x - 4 &&
          line.x2 <= r.x + r.w + 4
      );
      const isRectBorder = containingRects.some((r) => {
        const nearTop = Math.abs(line.y - r.y) <= intersectionTolerance;
        const nearBottom = Math.abs(line.y - (r.y + r.h)) <= intersectionTolerance;
        const spanRatio = (line.x2 - line.x1) / Math.max(1, r.w);
        return (nearTop || nearBottom) && spanRatio >= 0.72;
      });

      // A horizontal stroke crossing two or more vertical dividers is a table/grid
      // border, not a free-standing compilation underline.
      const intersectionCount = verticalIntersections(line);
      const isGridBorder = intersectionCount >= 2 ||
        (intersectionCount >= 1 && len >= estimatedPageWidth * 0.14);

      if (!isRectBorder && !isGridBorder) {
        regions.push({
          id: `geom_line_${pageNumber}_${Math.round(line.x1)}_${Math.round(line.y)}`,
          pageNumber,
          sourceBBox: { left: line.x1, top: line.y - 2, right: line.x2, bottom: line.y + 18 },
          geometryType: 'UNDERLINE',
          geometryConfidence: 0.88,
          physicalEvidence: 'PHYSICAL_UNDERLINE_LINE',
          rawLines: [line],
        });
      }
    }
  }

  // Dotted/leader rules recovered from raster are physical underlines, not table borders.
  // They are intentionally excluded from open-structure/grid reconstruction above.
  for (const line of dottedHorizontalLines) {
    regions.push({
      id: `geom_dotted_${pageNumber}_${Math.round(line.x1)}_${Math.round(line.y)}`,
      pageNumber,
      sourceBBox: { left: line.x1, top: line.y - 2, right: line.x2, bottom: line.y + 18 },
      geometryType: 'UNDERLINE',
      geometryConfidence: 0.84,
      physicalEvidence: 'RASTER_DOTTED_UNDERLINE',
      rawLines: [line],
    });
  }

  // 3. Process Text-Based Printed Underlines or Dots (e.g. "______" or "......")
  for (const item of pageTextItems) {
    const str = item.str;
    if (/[_]{3,}|[\.]{4,}/.test(str)) {
      const match = str.match(/([_]{3,}|[\.]{4,})/);
      if (match && match.index !== undefined) {
        const charWidth = item.w / Math.max(1, str.length);
        const underlineStartPt = item.x + match.index * charWidth;
        const underlineEndPt = item.x + item.w;

        regions.push({
          id: `geom_txt_line_${pageNumber}_${Math.round(underlineStartPt)}_${Math.round(item.yTop)}`,
          pageNumber,
          sourceBBox: {
            left: underlineStartPt,
            top: item.yTop - 2,
            right: underlineEndPt,
            bottom: item.yTop + item.h + 6,
          },
          geometryType: 'UNDERLINE',
          geometryConfidence: 0.90,
          physicalEvidence: 'TEXT_PRINTED_UNDERSCORES_OR_DOTS',
        });
      }
    }
  }

  return regions;
}

/**
 * Heuristically classifies a GeometricRegion and associates OCR labels.
 */
export function classifyRegionWithHeuristics(
  region: GeometricRegion,
  textItems: RawTextItem[],
  pageWidthPt: number,
  pageHeightPt: number
): HybridDetectionResult {
  const { pageNumber, sourceBBox, geometryType } = region;
  const geometricConfidence = region.geometryConfidence ?? 0.90;

  // Filter text items on the same page
  const pageText = textItems;

  // 1. NON_FILLABLE_SHAPE
  if (geometryType === 'NON_FILLABLE_SHAPE') {
    return {
      region,
      classification: 'NON_FILLABLE_GRAPHIC',
      labelAssociationMethod: 'UNASSOCIATED',
      labelConfidence: 0,
      heuristicConfidence: 0.95,
      fieldGeometry: null,
    };
  }

  // 2. OPEN_STRUCTURE (Two lines without side borders)
  if (geometryType === 'OPEN_STRUCTURE') {
    return {
      region,
      classification: 'STRUCTURAL_ONLY',
      labelAssociationMethod: 'UNASSOCIATED',
      labelConfidence: 0,
      heuristicConfidence: 0.90,
      fieldGeometry: null,
    };
  }

  // 3. CHECKBOX
  if (geometryType === 'CHECKBOX') {
    const boxX = sourceBBox.left;
    const boxY = sourceBBox.top;
    const boxW = sourceBBox.right - sourceBBox.left;
    const boxH = sourceBBox.bottom - sourceBBox.top;

    // Find nearby label (right, left, or above). OCR frequently recognizes the
    // checkbox glyph and its right-hand label as ONE text item (e.g. "[] redatto").
    // Recover the textual suffix without using domain-specific words.
    const sameRow = (it: RawTextItem) => Math.abs((it.yTop + it.h / 2) - (boxY + boxH / 2)) < Math.max(14, boxH * 0.7);
    const embeddedRightLabel = pageText
      .filter((it) => sameRow(it) && it.x <= boxX + boxW + 10 && it.x + it.w >= boxX + boxW + 18)
      .sort((a, b) => Math.abs(a.x - boxX) - Math.abs(b.x - boxX))[0];
    const rightLabel = pageText
      .filter((it) => sameRow(it) && it.x > boxX + boxW && it.x - (boxX + boxW) < 100)
      .sort((a, b) => a.x - b.x)[0];
    const leftLabel = pageText
      .filter((it) => sameRow(it) && it.x + it.w < boxX && boxX - (it.x + it.w) < 100)
      .sort((a, b) => (boxX - (a.x + a.w)) - (boxX - (b.x + b.w)))[0];
    const aboveLabel = pageText
      .filter((it) => boxY - (it.yTop + it.h) >= 0 && boxY - (it.yTop + it.h) < 24 && Math.abs(it.x - boxX) < 100)
      .sort((a, b) => (boxY - (a.yTop + a.h)) - (boxY - (b.yTop + b.h)))[0];

    const embeddedText = embeddedRightLabel ? cleanObservedLabel(embeddedRightLabel.str) : '';
    const rawChoiceLabel = embeddedText
      || (rightLabel ? rightLabel.str.trim() : '')
      || (leftLabel ? leftLabel.str.trim() : '')
      || (aboveLabel ? aboveLabel.str.trim() : '');

    const choiceLabel = rawChoiceLabel || 'Opzione';
    const assocMethod: LabelAssociationMethod = (embeddedText || rightLabel)
      ? 'RIGHT_NEIGHBOR'
      : leftLabel
      ? 'LEFT_NEIGHBOR'
      : aboveLabel
      ? 'TOP_HEADER'
      : 'UNASSOCIATED';

    const labelConfidence = rawChoiceLabel ? 0.90 : 0.50;
    const heuristicConfidence = 0.92;

    const fieldGeometry: FieldGeometry = {
      fieldId: generateFieldId(),
      label: choiceLabel.startsWith('Opzione') ? choiceLabel : `Scelta: ${choiceLabel}`,
      semanticKey: null,
      suggestedSemanticKey: null,
      suggestedLabel: choiceLabel,
      fieldType: 'SINGLE_CHOICE',
      backgroundMode: 'TRANSPARENT',
      calibrationStatus: 'PROPOSED',
      pageNumber,
      xPt: boxX,
      yPt: boxY,
      widthPt: boxW,
      heightPt: boxH,
      anchorText: choiceLabel,
      derivationMethod: 'CHECKBOX_BOX',
      detectionSource: 'GEOMETRY',
      confidence: 0.90,
      status: 'REVIEW_REQUIRED',
      geometricConfidence,
      heuristicConfidence,
      labelConfidence,
      rawGeometricBBox: sourceBBox,
      labelAssociationMethod: assocMethod,
    };

    return {
      region,
      classification: 'CHECKBOX',
      labelAssociationMethod: assocMethod,
      associatedLabel: choiceLabel,
      labelConfidence,
      fieldTypeSuggestion: 'SINGLE_CHOICE',
      heuristicConfidence,
      fieldGeometry,
    };
  }

  // 4. CLOSED_CELL or MULTILINE_STRUCTURE
  if (geometryType === 'CLOSED_CELL' || geometryType === 'MULTILINE_STRUCTURE') {
    const left = sourceBBox.left;
    const top = sourceBBox.top;
    const right = sourceBBox.right;
    const bottom = sourceBBox.bottom;
    const cellW = right - left;
    const cellH = bottom - top;

    const containedText = region.containsText || [];
    const pageHeights = pageText.map((it) => it.h).filter((h) => h >= 4 && h <= 120).sort((a, b) => a - b);
    const medianTextH = pageHeights.length ? pageHeights[Math.floor(pageHeights.length / 2)] : 18;
    const meaningfulContainedText = containedText.filter((it) => {
      const normalized = (it.str || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return false;
      const alnum = (normalized.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g) || []).length;
      const letters = (normalized.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
      const widthRatio = it.w / Math.max(1, cellW);
      const confidence = it.confidence;
      const timeLike = /^\d{1,2}[.:]\d{2}\s*[-–—]\s*\d{1,2}[.:]\d{2}$/.test(normalized);
      const numbered = /^\d{1,2}[.)]?$/.test(normalized);
      if (timeLike || numbered) return true;
      if (confidence !== undefined && confidence < 55 && alnum <= 5) return false;
      if (alnum <= 3 && it.h > medianTextH * 2.2) return false;
      if (alnum >= 4) return true;
      if (letters >= 2 && widthRatio >= 0.14) return true;
      if (widthRatio >= 0.24 && alnum >= 2) return true;
      return false;
    });
    const fullText = meaningfulContainedText.map((it) => it.str).join(' ').trim();

    // Check closed cell with meaningful text
    if (fullText.length > 0) {
      const lettersOnly = (fullText.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).join('');
      const upperCount = (lettersOnly.match(/[A-ZÀ-ÖØ-Þ]/g) || []).length;
      const upperRatio = lettersOnly.length ? upperCount / lettersOnly.length : 0;
      const textLeft = Math.min(...meaningfulContainedText.map((it) => it.x));
      const textRight = Math.max(...meaningfulContainedText.map((it) => it.x + it.w));
      const textTop = Math.min(...meaningfulContainedText.map((it) => it.yTop));
      const textBottom = Math.max(...meaningfulContainedText.map((it) => it.yTop + it.h));
      const textWidthRatio = Math.max(0, textRight - textLeft) / Math.max(1, cellW);
      const textHeightRatio = Math.max(0, textBottom - textTop) / Math.max(1, cellH);
      const isSectionHeader = lettersOnly.length >= 5 && upperRatio >= 0.78 && textWidthRatio >= 0.30;
      const isPromptColon = /[:?]\s*$/.test(fullText);
      const isExplicit = isExplicitPrompt(fullText);
      const isNumberedPrompt = /^(?:\d{1,2}\.\s+[A-Za-zÀ-ÖØ-öø-ÿ]|[a-e]\)\s+)/i.test(fullText);

      const isPrompt = (isPromptColon || isExplicit || isNumberedPrompt) && !isSectionHeader;

      // Multiline boxes commonly contain a short printed caption in the upper band
      // and a large blank area below it. That is a physically fillable partial cell
      // even when the caption has no colon (e.g. "Obiettivi ed esiti attesi").
      if (geometryType === 'MULTILINE_STRUCTURE' && !isSectionHeader) {
        const sortedContained = [...meaningfulContainedText].sort((a, b) => a.yTop - b.yTop || a.x - b.x);
        const maxTextBottom = Math.max(...sortedContained.map((it) => it.yTop + it.h));
        const freeBelow = bottom - maxTextBottom - 4;
        const textInLowerHalf = sortedContained.some((it) => it.yTop + it.h / 2 > top + cellH * 0.58);
        const topBand = sortedContained.filter((it) => it.yTop <= top + Math.max(60, cellH * 0.30));
        const topBandLeft = topBand.length ? Math.min(...topBand.map((it) => it.x)) : left;
        const topBandRight = topBand.length ? Math.max(...topBand.map((it) => it.x + it.w)) : left;
        const topBandSpanRatio = cellW > 0 ? Math.max(0, topBandRight - topBandLeft) / cellW : 1;
        // Header/title cells often have a caption spanning most of the cell width.
        // A fillable multiline cell instead has a compact prompt and a large blank body.
        const hasSubstantialBlankBody = freeBelow >= Math.max(30, cellH * 0.32) && !textInLowerHalf && topBandSpanRatio < 0.48;
        if (hasSubstantialBlankBody) {
          // Prefer the widest OCR phrase in the top band instead of concatenating
          // overlapping word+phrase items (which creates labels such as
          // "Obiettivi Obiettivi ed esiti attesi").
          const bestTopLabel = [...topBand]
            .filter((it) => it.str && it.str.trim())
            .sort((a, b) => b.w - a.w || b.str.length - a.str.length)[0]?.str || fullText;
          const cleanLabel = bestTopLabel.replace(/^[|\[\]\s]+|[|\[\]\s]+$/g, '').replace(/:$/, '').trim();
          const suggestion = suggestSemanticKey(cleanLabel);
          const fieldY = Math.round((maxTextBottom + 4) * 10) / 10;
          const fieldGeometry: FieldGeometry = {
            fieldId: generateFieldId(),
            label: suggestion.suggestedLabel || cleanLabel || 'Campo',
            semanticKey: null,
            suggestedSemanticKey: suggestion.semanticKey || null,
            suggestedLabel: suggestion.suggestedLabel || null,
            fieldType: 'TEXT_LONG',
            backgroundMode: 'OPAQUE_WHITE',
            calibrationStatus: 'PROPOSED',
            pageNumber,
            xPt: Math.round((left + 4) * 10) / 10,
            yPt: fieldY,
            widthPt: Math.max(20, Math.round((cellW - 8) * 10) / 10),
            heightPt: Math.max(20, Math.round((bottom - fieldY - 4) * 10) / 10),
            anchorText: cleanLabel,
            derivationMethod: 'TABLE_CELL',
            geometrySource: 'PARTIAL_CELL',
            detectionSource: 'COMBINED',
            confidence: 0.91,
            status: 'REVIEW_REQUIRED',
            geometricConfidence,
            heuristicConfidence: 0.91,
            labelConfidence: 0.86,
            semanticConfidence: suggestion.confidence,
            rawGeometricBBox: sourceBBox,
            labelAssociationMethod: 'CONTAINED_PROMPT',
          };
          return {
            region,
            classification: 'PARTIAL_CELL',
            labelAssociationMethod: 'CONTAINED_PROMPT',
            associatedLabel: cleanLabel,
            labelConfidence: 0.86,
            fieldTypeSuggestion: 'TEXT_LONG',
            heuristicConfidence: 0.91,
            semanticConfidence: suggestion.confidence,
            semanticKey: suggestion.semanticKey,
            fieldGeometry,
          };
        }
      }

      const lastItemRight = Math.max(...meaningfulContainedText.map((it) => it.x + it.w));
      const safeGap = 4;
      const editableLeft = Math.round((lastItemRight + safeGap) * 10) / 10;
      const editableRight = Math.round((right - safeGap) * 10) / 10;
      const editableWidth = editableRight - editableLeft;

      // If text is a prompt and there is significant remaining compilable space (>= 25 pt), it is a PARTIAL_CELL!
      if (isPrompt && editableWidth >= 25) {
        const cleanLabel = fullText.replace(/:$/, '').trim();
        const suggestion = suggestSemanticKey(cleanLabel);

        const heuristicConfidence = 0.92;
        const labelConfidence = 0.90;
        const semanticConfidence = suggestion.confidence;

        const fieldGeometry: FieldGeometry = {
          fieldId: generateFieldId(),
          label: suggestion.suggestedLabel || cleanLabel,
          semanticKey: null,
          suggestedSemanticKey: suggestion.semanticKey || null,
          suggestedLabel: suggestion.suggestedLabel || null,
          fieldType: cellH >= 45 ? 'TEXT_LONG' : suggestion.suggestedFieldType || 'TEXT_SHORT',
          backgroundMode: 'OPAQUE_WHITE',
          calibrationStatus: 'PROPOSED',
          pageNumber,
          xPt: editableLeft,
          yPt: Math.round((top + safeGap) * 10) / 10,
          widthPt: Math.round(editableWidth * 10) / 10,
          heightPt: Math.round((cellH - 2 * safeGap) * 10) / 10,
          anchorText: fullText,
          derivationMethod: 'TABLE_CELL',
          geometrySource: 'PARTIAL_CELL',
          detectionSource: 'COMBINED',
          confidence: 0.92,
          status: 'REVIEW_REQUIRED',
          geometricConfidence,
          heuristicConfidence,
          labelConfidence,
          semanticConfidence,
          rawGeometricBBox: sourceBBox,
          labelAssociationMethod: 'CONTAINED_PROMPT',
        };

        return {
          region,
          classification: 'PARTIAL_CELL',
          labelAssociationMethod: 'CONTAINED_PROMPT',
          associatedLabel: cleanLabel,
          labelConfidence,
          fieldTypeSuggestion: fieldGeometry.fieldType,
          heuristicConfidence,
          semanticConfidence,
          semanticKey: suggestion.semanticKey,
          fieldGeometry,
        };
      }

      const classification: HeuristicClassification = isSectionHeader ? 'HEADER_CELL' : 'STATIC_CELL';
      const occupancyConfidence = Math.min(0.98, 0.82 + Math.max(textWidthRatio, textHeightRatio) * 0.16);
      return {
        region,
        classification,
        labelAssociationMethod: 'CONTAINED_PROMPT',
        associatedLabel: fullText,
        labelConfidence: 0.90,
        heuristicConfidence: occupancyConfidence,
        fieldGeometry: null,
      };
    }

    // EMPTY_CELL: cell is completely empty or has no contained label
    // Check for nearby label outside the cell
    const leftLabel = pageText.find(
      (it) =>
        it.x + it.w <= left + 8 &&
        left - (it.x + it.w) < 120 &&
        Math.abs(it.yTop - top) < 20 &&
        isExplicitPrompt(it.str)
    );

    const topHeader = pageText.find(
      (it) =>
        top - (it.yTop + it.h) >= -2 &&
        top - (it.yTop + it.h) < 30 &&
        Math.abs(it.x - left) < 50
    );

    const colHeader = pageText.find(
      (it) =>
        top - (it.yTop + it.h) >= 0 &&
        top - (it.yTop + it.h) < 250 &&
        it.x >= left - 10 &&
        it.x <= right
    );

    let assocMethod: LabelAssociationMethod = 'UNASSOCIATED';
    let associatedLabel: string | undefined = undefined;
    let labelConfidence = 0.0;

    if (leftLabel) {
      assocMethod = 'LEFT_NEIGHBOR';
      associatedLabel = leftLabel.str.replace(/:$/, '').trim();
      labelConfidence = 0.88;
    } else if (topHeader) {
      assocMethod = 'TOP_HEADER';
      associatedLabel = topHeader.str.replace(/:$/, '').trim();
      labelConfidence = 0.85;
    } else if (colHeader) {
      assocMethod = 'COLUMN_HEADER';
      associatedLabel = colHeader.str.replace(/:$/, '').trim();
      labelConfidence = 0.80;
    }

    const suggestion = associatedLabel
      ? suggestSemanticKey(associatedLabel)
      : { semanticKey: null, suggestedSemanticKey: null, suggestedLabel: null, suggestedFieldType: 'TEXT_SHORT', confidence: 0 };

    const safeGap = 2;
    const editableLeft = Math.round((left + safeGap) * 10) / 10;
    const editableTop = Math.round((top + safeGap) * 10) / 10;
    const editableWidth = Math.round((cellW - 2 * safeGap) * 10) / 10;
    const editableHeight = Math.round((cellH - 2 * safeGap) * 10) / 10;

    const heuristicConfidence = associatedLabel ? 0.90 : 0.85;

    const fieldGeometry: FieldGeometry = {
      fieldId: generateFieldId(),
      label: suggestion.suggestedLabel || associatedLabel || 'Cella vuota',
      semanticKey: null,
      suggestedSemanticKey: suggestion.semanticKey || null,
      suggestedLabel: suggestion.suggestedLabel || null,
      fieldType: cellH >= 45 ? 'TEXT_LONG' : suggestion.suggestedFieldType || 'TEXT_SHORT',
      backgroundMode: 'OPAQUE_WHITE',
      calibrationStatus: 'PROPOSED',
      pageNumber,
      xPt: editableLeft,
      yPt: editableTop,
      widthPt: editableWidth,
      heightPt: editableHeight,
      anchorText: associatedLabel || 'Cella vuota',
      derivationMethod: 'TABLE_CELL',
      geometrySource: 'EMPTY_CELL',
      detectionSource: associatedLabel ? 'COMBINED' : 'GEOMETRY',
      confidence: heuristicConfidence,
      status: 'REVIEW_REQUIRED',
      geometricConfidence,
      heuristicConfidence,
      labelConfidence,
      semanticConfidence: suggestion.confidence,
      rawGeometricBBox: sourceBBox,
      labelAssociationMethod: assocMethod,
    };

    return {
      region,
      classification: 'EMPTY_CELL',
      labelAssociationMethod: assocMethod,
      associatedLabel,
      labelConfidence,
      fieldTypeSuggestion: fieldGeometry.fieldType,
      heuristicConfidence,
      semanticConfidence: suggestion.confidence,
      semanticKey: suggestion.semanticKey,
      fieldGeometry,
    };
  }

  // 5. UNDERLINE
  if (geometryType === 'UNDERLINE') {
    const line = region.rawLines ? region.rawLines[0] : null;
    const lineX1 = sourceBBox.left;
    const lineY = sourceBBox.top + 2;
    const lineX2 = sourceBBox.right;
    const lineLen = lineX2 - lineX1;

    // Reject strokes running through alphabetic OCR text. These are typically
    // baselines/serifs or raster fragments inside words, not fillable underlines.
    // Printed underscore/dot sequences are exempt because their text is itself
    // the physical field evidence.
    if (region.physicalEvidence !== 'TEXT_PRINTED_UNDERSCORES_OR_DOTS' && region.physicalEvidence !== 'RASTER_DOTTED_UNDERLINE') {
      const textStrokeOverlap = pageText.some((it) => {
        const alphaCount = (it.str.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
        if (alphaCount < 3) return false;
        const verticalHit = lineY >= it.yTop - 2 && lineY <= it.yTop + it.h + 2;
        const overlap = Math.max(0, Math.min(lineX2, it.x + it.w) - Math.max(lineX1, it.x));
        return verticalHit && overlap / Math.max(1, lineLen) >= 0.42;
      });
      if (textStrokeOverlap) {
        return {
          region,
          classification: 'STRUCTURAL_ONLY',
          labelAssociationMethod: 'UNASSOCIATED',
          labelConfidence: 0,
          heuristicConfidence: 0.94,
          fieldGeometry: null,
        };
      }
    }

    // Find the NEAREST nearby prompt to the left or above. OCR arrays are not
    // guaranteed to be spatially ordered, so Array.find() can bind a line to a
    // distant label merely because it appeared first in OCR output.
    const leftCandidates = pageText.filter(
      (it) => {
        const sameBand = Math.abs(it.yTop - lineY) < 25 || Math.abs(it.yTop + it.h - lineY) < 25;
        const gap = lineX1 - (it.x + it.w);
        const alphaCount = (it.str.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
        const directlyAdjacentLabel = alphaCount >= 3 && gap >= -12 && gap <= Math.max(110, it.h * 3.2);
        return sameBand && it.x <= lineX1 + 12 && it.x + it.w <= lineX2 + 10 &&
          (looksLikePromptText(it.str) || directlyAdjacentLabel);
      }
    ).sort((a, b) => {
      const da = Math.abs(lineX1 - (a.x + a.w)) + Math.abs((a.yTop + a.h / 2) - lineY) * 2;
      const db = Math.abs(lineX1 - (b.x + b.w)) + Math.abs((b.yTop + b.h / 2) - lineY) * 2;
      return da - db;
    });
    const promptLeft = leftCandidates[0];

    const aboveCandidates = pageText.filter(
      (it) =>
        looksLikePromptText(it.str) &&
        lineY - (it.yTop + it.h) >= 0 &&
        lineY - (it.yTop + it.h) < 24 &&
        Math.abs(it.x - lineX1) < 50
    ).sort((a, b) => {
      const da = lineY - (a.yTop + a.h) + Math.abs(a.x - lineX1) * 0.5;
      const db = lineY - (b.yTop + b.h) + Math.abs(b.x - lineX1) * 0.5;
      return da - db;
    });
    const promptAbove = aboveCandidates[0];

    const prompt = promptLeft || promptAbove;

    if (!prompt) {
      // Unlabelled isolated underline -> STRUCTURAL_ONLY
      return {
        region,
        classification: 'STRUCTURAL_ONLY',
        labelAssociationMethod: 'UNASSOCIATED',
        labelConfidence: 0,
        heuristicConfidence: 0.85,
        fieldGeometry: null,
      };
    }

    const cleanLabel = cleanObservedLabel(prompt.str);
    const suggestion = suggestSemanticKey(cleanLabel);
    const isDate = /data|nato\s+il|lì/i.test(cleanLabel);

    let fieldX = Math.round(lineX1 * 10) / 10;
    let fieldW = Math.round(lineLen * 10) / 10;
    let fieldY = Math.max(0, Math.round((lineY - 18) * 10) / 10);

    if (promptLeft) {
      fieldX = Math.max(lineX1, Math.round((promptLeft.x + promptLeft.w + 4) * 10) / 10);
      fieldW = Math.max(30, Math.round((lineX2 - fieldX) * 10) / 10);
    } else if (promptAbove) {
      fieldY = Math.max(0, Math.max(Math.round((lineY - 18) * 10) / 10, Math.round((promptAbove.yTop + promptAbove.h + 2) * 10) / 10));
    }

    const assocMethod: LabelAssociationMethod = promptLeft ? 'LEFT_NEIGHBOR' : 'TOP_HEADER';
    const heuristicConfidence = 0.90;
    const labelConfidence = 0.88;

    const fieldGeometry: FieldGeometry = {
      fieldId: generateFieldId(),
      label: suggestion.suggestedLabel || cleanLabel,
      semanticKey: null,
      suggestedSemanticKey: suggestion.semanticKey || null,
      suggestedLabel: suggestion.suggestedLabel || null,
      fieldType: isDate ? 'DATE' : suggestion.suggestedFieldType || 'TEXT_SHORT',
      backgroundMode: 'OPAQUE_WHITE',
      calibrationStatus: 'PROPOSED',
      pageNumber,
      xPt: fieldX,
      yPt: fieldY,
      widthPt: fieldW,
      heightPt: 20,
      anchorText: prompt.str,
      derivationMethod: 'VECTOR_LINE',
      geometrySource: 'UNDERLINE',
      detectionSource: region.physicalEvidence === 'TEXT_PRINTED_UNDERSCORES_OR_DOTS' ? 'TEXT_LAYER' : 'COMBINED',
      confidence: 0.90,
      status: 'REVIEW_REQUIRED',
      geometricConfidence,
      heuristicConfidence,
      labelConfidence,
      semanticConfidence: suggestion.confidence,
      rawGeometricBBox: sourceBBox,
      labelAssociationMethod: assocMethod,
    };

    return {
      region,
      classification: 'UNDERLINE_FIELD',
      labelAssociationMethod: assocMethod,
      associatedLabel: cleanLabel,
      labelConfidence,
      fieldTypeSuggestion: fieldGeometry.fieldType,
      heuristicConfidence,
      semanticConfidence: suggestion.confidence,
      semanticKey: suggestion.semanticKey,
      fieldGeometry,
    };
  }

  return {
    region,
    classification: 'UNRESOLVED',
    labelAssociationMethod: 'UNASSOCIATED',
    labelConfidence: 0,
    heuristicConfidence: 0.50,
    fieldGeometry: null,
  };
}

/**
 * Detects OCR labels that have NO physical geometric structure (no line, box, cell, underline or checkbox).
 * Records them as UNRESOLVED_POTENTIAL_LABEL for diagnostics and DOES NOT create a FieldGeometry.
 */
export function detectUnresolvedPotentialLabels(
  textItems: RawTextItem[],
  physicalRegions: GeometricRegion[],
  pageNumber: number
): UnresolvedPotentialLabel[] {
  const unresolvedLabels: UnresolvedPotentialLabel[] = [];

  for (const item of textItems) {
    if (!isExplicitPrompt(item.str)) continue;

    const itemBBox = {
      left: item.x,
      top: item.yTop,
      right: item.x + item.w,
      bottom: item.yTop + item.h,
    };

    // Check if this label is near or inside any physical geometric region
    const hasPhysicalSupport = physicalRegions.some((reg) => {
      const sb = reg.sourceBBox;
      // Overlap or horizontal/vertical proximity (< 30 pt)
      const sameLineBand = Math.abs(sb.top - itemBBox.top) < 20;
      const nearHoriz = sb.right >= itemBBox.left - 30 && sb.left <= itemBBox.right + 150;
      const nearVert = sb.top >= itemBBox.bottom - 5 && sb.top <= itemBBox.bottom + 40 && Math.abs(sb.left - itemBBox.left) < 60;
      return (sameLineBand && nearHoriz) || nearVert;
    });

    if (!hasPhysicalSupport) {
      unresolvedLabels.push({
        label: item.str.trim(),
        pageNumber,
        bbox: itemBBox,
        reason: 'NO_PHYSICAL_GEOMETRY',
      });
    }
  }

  return unresolvedLabels;
}

/**
 * Orchestrates the full CTE-FIX-03B hybrid geometric + heuristic detection pipeline for a page.
 */
export function runHybridDetectionPipeline(input: RunHybridDetectionInput): HybridDetectionPipelineOutput {
  const { pageNumber, pageWidthPt, pageHeightPt, rawLines, rawRects, textItems } = input;

  // 1. PHYSICAL REGION CANDIDATES
  const physicalRegions = extractGeometricRegions({
    pageNumber,
    pageWidthPt,
    rawLines,
    rawRects,
    textItems,
  });

  // 2. HEURISTIC CLASSIFICATION & LABEL ASSOCIATION & CTE MAPPING
  const results: HybridDetectionResult[] = [];
  const authoritativeFields: FieldGeometry[] = [];

  let fillableFieldsCount = 0;
  let emptyCellsCount = 0;
  let partialCellsCount = 0;
  let underlineFieldsCount = 0;
  let checkboxesCount = 0;
  let headerCellsCount = 0;
  let structuralOnlyCount = 0;
  let nonFillableGraphicsCount = 0;
  let unresolvedCount = 0;

  for (const region of physicalRegions) {
    const classified = classifyRegionWithHeuristics(region, textItems, pageWidthPt, pageHeightPt);
    results.push(classified);

    switch (classified.classification) {
      case 'EMPTY_CELL':
        emptyCellsCount++;
        break;
      case 'PARTIAL_CELL':
        partialCellsCount++;
        break;
      case 'UNDERLINE_FIELD':
        underlineFieldsCount++;
        break;
      case 'CHECKBOX':
        checkboxesCount++;
        break;
      case 'FILLABLE_FIELD':
        fillableFieldsCount++;
        break;
      case 'HEADER_CELL':
      case 'STATIC_CELL':
        headerCellsCount++;
        break;
      case 'STRUCTURAL_ONLY':
        structuralOnlyCount++;
        break;
      case 'NON_FILLABLE_GRAPHIC':
        nonFillableGraphicsCount++;
        break;
      case 'UNRESOLVED':
        unresolvedCount++;
        break;
    }

    if (classified.fieldGeometry) {
      authoritativeFields.push(classified.fieldGeometry);
    }
  }

  // 3. UNRESOLVED POTENTIAL LABELS (Labels without geometry)
  const unresolvedPotentialLabels = detectUnresolvedPotentialLabels(textItems, physicalRegions, pageNumber);


  return {
    results,
    authoritativeFields,
    unresolvedPotentialLabels,
    diagnostics: {
      totalRegionsDetected: physicalRegions.length,
      fillableFieldsCount,
      emptyCellsCount,
      partialCellsCount,
      underlineFieldsCount,
      checkboxesCount,
      headerCellsCount,
      structuralOnlyCount,
      nonFillableGraphicsCount,
      unresolvedCount,
      unresolvedPotentialLabelsCount: unresolvedPotentialLabels.length,
    },
  };
}
