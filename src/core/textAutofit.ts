/**
 * @license
 * PEI FACILE — Frozen Typography & Autofit Engine (Phase 1D-R1)
 * Enforces the strict text fitting contract and sequence:
 * 1. Font Size: 12 → 11 → 10 → 9 → 8 pt (Strictly min 8 pt, never lower)
 * 2. Tracking: 0 → -0.5 → -1.0 → -1.5 pt
 * 3. Interlinea: standard (1.50) → 1.35 → 1.20
 * 4. Final Field Overflow Policy: RIGID | CONTINUABLE | EXPANDABLE_OR_TABULAR
 *
 * FORBIDDEN:
 * - Clipping
 * - Overflow: hidden cutting off content
 * - Text cut off / truncated
 * - Font sizes < 8 pt
 */

import type { FieldOverflowPolicy } from './templateSchemaTypes';

export const AUTOFIT_FONT_SIZES_PT = [12, 11, 10, 9, 8] as const;
export const AUTOFIT_TRACKING_PT = [0, -0.5, -1.0, -1.5] as const;
export const AUTOFIT_LINE_HEIGHTS = [1.50, 1.35, 1.20] as const;

export const MIN_FONT_SIZE_PT = 8;
export const MAX_FONT_SIZE_PT = 12;

export interface AutofitStepResult {
  fontSizePt: number;
  trackingPt: number;
  lineHeight: number;
  overflowsBox: boolean;
  overflowPolicy: FieldOverflowPolicy;
  policyAction: 'NONE' | 'TEACHER_SYNTHESIS_REQUIRED' | 'CONTINUATION_BLOCK' | 'TABULAR_EXPANSION';
}

/**
 * Calculates deterministic text dimensions based on character count, average glyph ratio,
 * line wrapping, font size, tracking, and line height.
 */
export function estimateTextDimensions(
  text: string,
  fontSizePt: number,
  trackingPt: number,
  lineHeight: number,
  boxWidthPt: number
): { heightPt: number; lines: number; maxLineWidthPt: number } {
  if (!text || text.trim().length === 0) {
    return { heightPt: fontSizePt * lineHeight, lines: 1, maxLineWidthPt: 0 };
  }

  // Average proportional glyph width factor for standard UI/print sans-serif font
  const glyphWidthFactor = 0.52;
  const effectiveCharWidth = fontSizePt * glyphWidthFactor + trackingPt;
  const maxCharsPerLine = Math.max(1, Math.floor((boxWidthPt - 4) / Math.max(2, effectiveCharWidth)));

  const paragraphs = text.split('\n');
  let totalLines = 0;
  let maxLineWidth = 0;

  for (const para of paragraphs) {
    if (para.length === 0) {
      totalLines += 1;
      continue;
    }
    const words = para.split(' ');
    let currentLineLength = 0;

    for (const word of words) {
      const wordLen = word.length;
      if (currentLineLength === 0) {
        currentLineLength = wordLen;
      } else if (currentLineLength + 1 + wordLen <= maxCharsPerLine) {
        currentLineLength += 1 + wordLen;
      } else {
        totalLines += 1;
        maxLineWidth = Math.max(maxLineWidth, currentLineLength * effectiveCharWidth);
        currentLineLength = wordLen;
      }
    }
    if (currentLineLength > 0) {
      totalLines += 1;
      maxLineWidth = Math.max(maxLineWidth, currentLineLength * effectiveCharWidth);
    }
  }

  const effectiveLines = Math.max(1, totalLines);
  const totalHeightPt = effectiveLines * (fontSizePt * lineHeight);

  return {
    heightPt: totalHeightPt,
    lines: effectiveLines,
    maxLineWidthPt: maxLineWidth,
  };
}

/**
 * Executes the frozen step-by-step autofit algorithm:
 * 1. Decreases font size: 12 → 11 → 10 → 9 → 8 pt
 * 2. Then decreases tracking: 0 → -0.5 → -1.0 → -1.5 pt
 * 3. Then tightens line height: 1.50 → 1.35 → 1.20
 * 4. If content still exceeds container, triggers the field's explicit overflowPolicy.
 */
export function computeTextAutofit(
  text: string,
  boxWidthPt: number,
  boxHeightPt: number,
  overflowPolicy: FieldOverflowPolicy = 'RIGID'
): AutofitStepResult {
  // If box is invalid or text is empty, return baseline
  if (boxWidthPt <= 0 || boxHeightPt <= 0 || !text || text.trim().length === 0) {
    return {
      fontSizePt: 10,
      trackingPt: 0,
      lineHeight: 1.35,
      overflowsBox: false,
      overflowPolicy,
      policyAction: 'NONE',
    };
  }

  // Iterate strictly through the frozen sequence
  for (const fontSize of AUTOFIT_FONT_SIZES_PT) {
    for (const tracking of AUTOFIT_TRACKING_PT) {
      for (const lineHeight of AUTOFIT_LINE_HEIGHTS) {
        const dims = estimateTextDimensions(text, fontSize, tracking, lineHeight, boxWidthPt);
        if (dims.heightPt <= boxHeightPt + 1) {
          // Fits within bounds!
          return {
            fontSizePt: fontSize,
            trackingPt: tracking,
            lineHeight,
            overflowsBox: false,
            overflowPolicy,
            policyAction: 'NONE',
          };
        }
      }
    }
  }

  // If we reach here, text cannot fit even at minimum constraints (8pt, -1.5 tracking, 1.20 line-height)
  // Derive policy action according to field's explicit overflowPolicy:
  let policyAction: AutofitStepResult['policyAction'] = 'TEACHER_SYNTHESIS_REQUIRED';
  if (overflowPolicy === 'CONTINUABLE') {
    policyAction = 'CONTINUATION_BLOCK';
  } else if (overflowPolicy === 'EXPANDABLE_OR_TABULAR') {
    policyAction = 'TABULAR_EXPANSION';
  } else {
    policyAction = 'TEACHER_SYNTHESIS_REQUIRED';
  }

  return {
    fontSizePt: MIN_FONT_SIZE_PT,
    trackingPt: -1.5,
    lineHeight: 1.20,
    overflowsBox: true,
    overflowPolicy,
    policyAction,
  };
}
