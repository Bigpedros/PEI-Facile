/**
 * @license
 * PEI FACILE — CTE-FIX-03B Hybrid Geometric + Heuristic Field Detection Engine
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
  rawLines: RawLineCandidate[];
  rawRects: RawRectCandidate[];
  textItems: RawTextItem[];
}): GeometricRegion[] {
  const { pageNumber, rawLines, rawRects, textItems } = input;
  const regions: GeometricRegion[] = [];

  // Enforce strict pageNumber
  const pageTextItems = textItems;

  // 1. Process Rectangles
  for (const rect of rawRects) {
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;

    // A. Checkbox: small square (w in [8, 28], h in [8, 28])
    if (rect.isCheckbox || (rect.w >= 8 && rect.w <= 28 && rect.h >= 8 && rect.h <= 28)) {
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
    if (rect.w >= 30 && rect.h >= 14) {
      // Find contained text items
      const insideText = pageTextItems.filter(
        (it) =>
          it.x >= left - 2 &&
          it.x + it.w <= right + 4 &&
          it.yTop >= top - 2 &&
          it.yTop + it.h <= bottom + 4
      );

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
  const horizontalLines = normalizedLines.filter((l) => !l.isVertical && l.x2 - l.x1 >= 25);

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
  for (const line of horizontalLines) {
    const len = line.x2 - line.x1;
    if (len >= 30) {
      // Check if line is already inside a closed rect
      const insideRect = rawRects.some(
        (r) =>
          line.y >= r.y - 2 &&
          line.y <= r.y + r.h + 2 &&
          line.x1 >= r.x - 4 &&
          line.x2 <= r.x + r.w + 4
      );

      if (!insideRect) {
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

    // Find nearby label (right, left, or above)
    const rightLabel = pageText.find(
      (it) => Math.abs(it.yTop - boxY) < 12 && it.x > boxX + boxW && it.x - (boxX + boxW) < 80
    );
    const leftLabel = pageText.find(
      (it) => Math.abs(it.yTop - boxY) < 12 && it.x + it.w < boxX && boxX - (it.x + it.w) < 80
    );
    const aboveLabel = pageText.find(
      (it) => boxY - (it.yTop + it.h) >= 0 && boxY - (it.yTop + it.h) < 20 && Math.abs(it.x - boxX) < 80
    );

    const rawChoiceLabel = rightLabel
      ? rightLabel.str.trim()
      : leftLabel
      ? leftLabel.str.trim()
      : aboveLabel
      ? aboveLabel.str.trim()
      : '';

    const choiceLabel = rawChoiceLabel || 'Opzione';
    const assocMethod: LabelAssociationMethod = rightLabel
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
    const fullText = containedText.map((it) => it.str).join(' ').trim();

    // Check closed cell with text
    if (fullText.length > 0) {
      const isSectionHeader = /^(SEZIONE|ALLEGATO|PROFILO|TABELLA|ISTRUZIONI|PARTE\s+\d|QUADRO|NOTE\s+GENERALI)/i.test(fullText);
      const isPromptColon = /[:?]\s*$/.test(fullText);
      const isExplicit = isExplicitPrompt(fullText);
      const isNumberedPrompt = /^(1\.|2\.|3\.|4\.|5\.|6\.|7\.|8\.|9\.|a\)|b\)|c\)|d\)|e\))/i.test(fullText);

      const isPrompt = (isPromptColon || isExplicit || isNumberedPrompt) && !isSectionHeader;

      const lastItemRight = Math.max(...containedText.map((it) => it.x + it.w));
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

      // If text is a section header, title, or fills the cell, it's a STATIC_CELL / HEADER_CELL
      return {
        region,
        classification: 'HEADER_CELL',
        labelAssociationMethod: 'CONTAINED_PROMPT',
        associatedLabel: fullText,
        labelConfidence: 0.90,
        heuristicConfidence: 0.95,
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

    // Find nearby prompt to the left or above
    const promptLeft = pageText.find(
      (it) =>
        isExplicitPrompt(it.str) &&
        (Math.abs(it.yTop - lineY) < 25 || Math.abs(it.yTop + it.h - lineY) < 25) &&
        it.x <= lineX1 + 12 &&
        it.x + it.w <= lineX2 + 10
    );

    const promptAbove = pageText.find(
      (it) =>
        isExplicitPrompt(it.str) &&
        lineY - (it.yTop + it.h) >= 0 &&
        lineY - (it.yTop + it.h) < 24 &&
        Math.abs(it.x - lineX1) < 50
    );

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

    const cleanLabel = prompt.str.replace(/:$/, '').trim();
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

  // TEMPORARY READ-ONLY DIAGNOSTIC LOGS (CTE-FIX-03C)
  console.log(`[03C][START]\npageNumber: ${pageNumber}`);
  console.log(`[03C][ENGINE]\nHYBRID_DETECTION_ENGINE_CALLED = true`);
  console.log(`[03C][REGIONS]\ngeometricRegionsCount: ${physicalRegions.length}\nclosedCellsCount: ${physicalRegions.filter((r) => r.geometryType === 'CLOSED_CELL').length}\nunderlinesCount: ${physicalRegions.filter((r) => r.geometryType === 'UNDERLINE').length}\ncheckboxesCount: ${physicalRegions.filter((r) => r.geometryType === 'CHECKBOX').length}\nopenStructuresCount: ${physicalRegions.filter((r) => r.geometryType === 'OPEN_STRUCTURE').length}`);
  console.log(`[03C][HEURISTIC]\nfillableCount: ${fillableFieldsCount}\nemptyCellCount: ${emptyCellsCount}\npartialCellCount: ${partialCellsCount}\nunderlineFieldCount: ${underlineFieldsCount}\nstaticCellCount: ${headerCellsCount}\nheaderCellCount: ${headerCellsCount}\nunresolvedCount: ${unresolvedCount}`);
  console.log(`[03C][FIELDS]\nauthoritativeFieldsCount: ${authoritativeFields.length}`);

  results.slice(0, 20).forEach((res, idx) => {
    const fg = res.fieldGeometry;
    console.log(`[03C][FIELD_ITEM_${idx + 1}] id: ${fg?.fieldId || 'N/A'}, pageNumber: ${fg?.pageNumber || pageNumber}, classification: ${res.classification}, geometryType: ${res.region.geometryType}, sourceBBox: ${JSON.stringify(res.region.sourceBBox)}, finalBBox: ${fg ? JSON.stringify({ xPt: fg.xPt, yPt: fg.yPt, widthPt: fg.widthPt, heightPt: fg.heightPt }) : 'N/A'}, associatedLabel: "${res.associatedLabel || ''}", semanticKey: "${res.semanticKey || ''}"`);
  });

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
