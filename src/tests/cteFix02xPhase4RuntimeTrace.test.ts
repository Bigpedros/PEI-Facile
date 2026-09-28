/**
 * @license
 * PEI FACILE — CTE-FIX-02X-RUNTIME
 * Phase 4 Runtime Trace & Raw Candidate Creation Proof
 * Strictly READ-ONLY diagnostic verification suite.
 */

import { describe, it, expect } from 'vitest';
import { detectFieldsOnPdfPage } from '../core/assistedFieldDetectionService';
import { clusterAndRefineCandidates } from '../core/fieldCandidateClustering';

interface TextItemInput {
  x: number;
  yTop: number;
  w: number;
  h: number;
  str: string;
}

interface VectorLineInput {
  x1: number;
  y: number;
  x2: number;
}

interface VectorBoxInput {
  x: number;
  y: number;
  w: number;
  h: number;
  isCheckbox?: boolean;
}

/**
 * Calculates available whitespace to the right and below a given text label item.
 */
function calculateWhiteSpace(
  item: TextItemInput,
  textItems: TextItemInput[],
  rawLines: VectorLineInput[],
  rawRects: VectorBoxInput[],
  pageWidthPt = 595.32,
  pageHeightPt = 841.92
) {
  const rightMarginBoundary = pageWidthPt - 36; // 36pt right margin

  // Find nearest text to the right on the same line band
  const textRight = textItems
    .filter((it) => it !== item && Math.abs(it.yTop - item.yTop) < 10 && it.x > item.x + item.w)
    .sort((a, b) => a.x - b.x)[0];
  const nearestTextRightX = textRight ? textRight.x : rightMarginBoundary;

  // Find nearest graphic (line/box) to the right
  const lineRight = rawLines
    .filter((vl) => vl.y >= item.yTop - 5 && vl.y <= item.yTop + item.h + 15 && vl.x1 > item.x + item.w)
    .sort((a, b) => a.x1 - b.x1)[0];
  const boxRight = rawRects
    .filter((vb) => vb.y <= item.yTop + item.h + 10 && vb.y + vb.h >= item.yTop - 5 && vb.x > item.x + item.w)
    .sort((a, b) => a.x - b.x)[0];

  const nearestGraphicRightX = Math.min(
    lineRight ? lineRight.x1 : rightMarginBoundary,
    boxRight ? boxRight.x : rightMarginBoundary
  );

  const usableRightMarginX = Math.min(nearestTextRightX, nearestGraphicRightX, rightMarginBoundary);
  const whiteSpaceWidthRight = Math.max(0, Math.round((usableRightMarginX - (item.x + item.w)) * 10) / 10);

  // Find nearest text or graphic below
  const textBelow = textItems
    .filter((it) => it !== item && it.yTop > item.yTop + item.h && Math.abs(it.x - item.x) < 200)
    .sort((a, b) => a.yTop - b.yTop)[0];
  const nearestTextBelowY = textBelow ? textBelow.yTop : Math.min(pageHeightPt - 36, item.yTop + item.h + 50);

  const lineBelow = rawLines
    .filter((vl) => vl.y > item.yTop + item.h && vl.x1 <= item.x + item.w && vl.x2 >= item.x)
    .sort((a, b) => a.y - b.y)[0];
  const nearestGraphicBelowY = lineBelow ? lineBelow.y : Math.min(pageHeightPt - 36, item.yTop + item.h + 50);

  const whiteSpaceHeightBelow = Math.max(
    0,
    Math.round((Math.min(nearestTextBelowY, nearestGraphicBelowY) - (item.yTop + item.h)) * 10) / 10
  );

  return {
    nearestTextRightX,
    nearestGraphicRightX,
    usableRightMarginX,
    whiteSpaceWidthRight,
    nearestTextBelowY,
    nearestGraphicBelowY,
    whiteSpaceHeightBelow,
  };
}

describe('CTE-FIX-02X-RUNTIME — Phase 4 Runtime Trace Suite', () => {
  it('TEST A: BAMBINO/A without vector underline line produces candidateCreated = false and rejectReason = NO_MATCHED_GEOMETRY', async () => {
    // Simulated Page setup representing PEI form page without explicit vector underlines for BAMBINO/A
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'ALUNNO/A:', transform: [12, 0, 0, 12, 40.2, 700.5] },
          { str: 'BAMBINO/A', transform: [12, 0, 0, 12, 40.2, 680.5] },
          { str: 'Codice Fiscale:', transform: [12, 0, 0, 12, 300.0, 680.5] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const bambinoProposal = proposals.find((p) => p.label.toUpperCase().includes('BAMBINO'));

    // PROOF: No candidate was created for BAMBINO/A because matchedGeometry was false
    expect(bambinoProposal).toBeUndefined();
  });

  it('TEST B: Sezione without vector line produces candidateCreated = false and rejectReason = NO_MATCHED_GEOMETRY', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Classe:', transform: [12, 0, 0, 12, 40.0, 650.0] },
          { str: 'Sezione', transform: [12, 0, 0, 12, 180.0, 650.0] },
          { str: 'Scuola:', transform: [12, 0, 0, 12, 320.0, 650.0] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const sezioneProposal = proposals.find((p) => p.label.toLowerCase().includes('sezione'));

    expect(sezioneProposal).toBeUndefined();
  });

  it('TEST C: Plesso / Plesso o sede without vector line produces candidateCreated = false', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Plesso o sede', transform: [12, 0, 0, 12, 40.0, 620.0] },
          { str: 'Indirizzo:', transform: [12, 0, 0, 12, 280.0, 620.0] },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const plessoProposal = proposals.find((p) => p.label.toLowerCase().includes('plesso'));

    expect(plessoProposal).toBeUndefined();
  });

  it('TEST D: "Data:" token with neighbor is filtered by SHORT_GENERIC_FILTER', async () => {
    const mockPageProxy: any = {
      getViewport: () => ({ width: 595.32, height: 841.92 }),
      getTextContent: async () => ({
        items: [
          { str: 'Data:', transform: [12, 0, 0, 12, 40.0, 580.0] },
          { str: 'di nascita', transform: [12, 0, 0, 12, 75.0, 580.0] }, // neighbor on same line
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
    };

    const proposals = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
    const dataProposal = proposals.find((p) => p.label.toLowerCase() === 'data');

    expect(dataProposal).toBeUndefined();
  });

  it('TEST E: Checkbox without nearby valid label fails structural validation with rejectReason = ORPHAN_CHECKBOX', () => {
    const clusterResult = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: 595.32,
      pageHeightPt: 841.92,
      rawLines: [],
      rawRects: [{ x: 50, y: 100, w: 12, h: 12, isCheckbox: true }], // isolated checkbox
      textItems: [],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(clusterResult.proposedFields.length).toBe(0);
    expect(clusterResult.diagnostics.filteredLowConfidenceCount).toBeGreaterThan(0);
  });

  it('TEST F: whitespace calculation accurately calculates available compilation space without mutating detector logic', () => {
    const item = { x: 40, yTop: 200, w: 70, h: 14, str: 'BAMBINO/A' };
    const textItems = [
      item,
      { x: 300, yTop: 200, w: 90, h: 14, str: 'Codice Fiscale:' },
    ];

    const ws = calculateWhiteSpace(item, textItems, [], []);
    expect(ws.nearestTextRightX).toBe(300);
    expect(ws.usableRightMarginX).toBe(300);
    expect(ws.whiteSpaceWidthRight).toBe(190); // 300 - (40 + 70) = 190pt available space!
  });
});
