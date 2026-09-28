/**
 * @license
 * PEI FACILE — CTE-FIX-02F Cell Editability Discrimination Test Suite
 * Validates that table cells and geometric boxes require POSITIVE EDITABILITY EVIDENCE.
 *
 * Mandatory Tests:
 * TEST A — STATIC TEXT CELL ("PROFILO" without input area -> NO field)
 * TEST B — HEADER TEXT CELL ("SCOLASTICA" as header -> NO field)
 * TEST C — EMPTY STRUCTURAL CELL (empty box with no label/input role -> NO "Campo da identificare")
 * TEST D — LABEL + REAL INPUT CELL (label associated to empty cell -> YES field)
 * TEST E — LABEL + LINE INPUT (label followed by line/space -> YES field)
 * TEST F — NARRATIVE AREA (descriptive label + large writable area -> area = TEXT_LONG)
 * TEST G — CHECKBOX (real checkbox -> YES field)
 * TEST H — PURE GRAPHIC BOX (graphic box -> NO field)
 * TEST I — RECOVERY REGRESSION (excluded for no evidence -> NOT reintroduced in Recovery Pass)
 * TEST J — NATIVE PDF REGRESSION
 * TEST K — RASTER PDF REGRESSION
 */

import { describe, it, expect, vi } from 'vitest';
import {
  clusterAndRefineCandidates,
  type RawLineCandidate,
  type RawRectCandidate,
  type RawTextItem,
} from '../core/fieldCandidateClustering';
import { extractCellInteriorRect, isExplicitPrompt } from '../data/geometry/geometryTransform';
import { detectFieldsOnPdfPage } from '../core/assistedFieldDetectionService';

const PAGE_W = 595.32;
const PAGE_H = 841.92;

describe('CTE-FIX-02F — Cell Editability Discrimination Suite', () => {
  // TEST A — STATIC TEXT CELL
  it('TEST A: cell containing static title "PROFILO" without input area does NOT produce a field', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 100, w: 200, h: 40 },
    ];
    const textItems: RawTextItem[] = [
      { x: 60, yTop: 110, w: 80, h: 14, str: 'PROFILO' },
    ];

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(0);
    expect(diagnostics.discardedReasons.HEADER_ONLY).toBeGreaterThanOrEqual(1);
  });

  // TEST B — HEADER TEXT CELL
  it('TEST B: cell containing header text "SCOLASTICA" as header does NOT produce a field', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 150, w: 220, h: 35 },
    ];
    const textItems: RawTextItem[] = [
      { x: 55, yTop: 160, w: 100, h: 14, str: 'INTEGRAZIONE SCOLASTICA' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(0);
  });

  // TEST C — EMPTY STRUCTURAL CELL
  it('TEST C: empty structural rectangle without label or input role does NOT produce "Campo da identificare"', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 100, y: 200, w: 180, h: 30 }, // Unlabeled empty cell
    ];

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems: [],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(0);
    expect(diagnostics.discardedReasons.TABLE_STRUCTURE).toBeGreaterThanOrEqual(1);
  });

  // TEST D — LABEL + REAL INPUT CELL
  it('TEST D: label cell on left associated with empty value cell on right DOES produce a field', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 100, w: 120, h: 28 },  // Label cell
      { x: 170, y: 100, w: 200, h: 28 }, // Value cell
    ];
    const textItems: RawTextItem[] = [
      { x: 55, yTop: 108, w: 60, h: 12, str: 'Sezione:' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields.length).toBeGreaterThanOrEqual(1);
    const valueField = proposedFields.find((f) => f.xPt >= 160);
    expect(valueField).toBeDefined();
    expect(valueField?.label).toContain('Sezione');
  });

  // TEST E — LABEL + LINE INPUT
  it('TEST E: prompt label followed by input line DOES produce a field on the line', () => {
    const rawLines: RawLineCandidate[] = [
      { x1: 150, y: 120, x2: 400 },
    ];
    const textItems: RawTextItem[] = [
      { x: 50, yTop: 108, w: 90, h: 12, str: 'BAMBINO/A:' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines,
      rawRects: [],
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(1);
    expect(proposedFields[0].label).toContain('BAMBINO/A');
    expect(proposedFields[0].xPt).toBeGreaterThanOrEqual(140);
  });

  // TEST F — NARRATIVE AREA
  it('TEST F: descriptive label + large box produces a TEXT_LONG field with label excluded from bbox', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 200, w: 500, h: 120 },
    ];
    const textItems: RawTextItem[] = [
      { x: 55, yTop: 205, w: 300, h: 12, str: 'Situazione familiare descritta dai genitori:' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(1);
    expect(proposedFields[0].fieldType).toBe('TEXT_LONG');
    expect(proposedFields[0].label).toContain('Situazione familiare');
    // Field bbox must be below prompt
    expect(proposedFields[0].yPt).toBeGreaterThan(215);
  });

  // TEST G — CHECKBOX
  it('TEST G: real checkbox control produces a SINGLE_CHOICE field', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 60, y: 300, w: 14, h: 14, isCheckbox: true },
    ];
    const textItems: RawTextItem[] = [
      { x: 80, yTop: 301, w: 60, h: 12, str: 'Maschio' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(1);
    expect(proposedFields[0].fieldType).toBe('SINGLE_CHOICE');
    expect(proposedFields[0].label).toContain('Maschio');
  });

  // TEST H — PURE GRAPHIC BOX
  it('TEST H: pure graphic frame or border box without prompt role does NOT produce a field', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 20, y: 20, w: 555, h: 800 }, // Full page border
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems: [],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(0);
  });

  // TEST I — RECOVERY REGRESSION
  it('TEST I: empty box excluded in Step 4 is NOT reintroduced by Step 8 Recovery Pass', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 80, y: 150, w: 200, h: 30 },
    ];

    const { proposedFields, diagnostics } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      rawLines: [],
      rawRects,
      textItems: [],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(0);
    expect(diagnostics.recoveryPassAddedCount).toBe(0);
  });

  // TEST J — NATIVE PDF REGRESSION
  it('TEST J: native PDF page with acroform fields continues to work without regression', async () => {
    const mockPage = {
      pageNumber: 1,
      rotate: 0,
      view: [0, 0, PAGE_W, PAGE_H],
      getViewport: () => ({
        scale: 1.0,
        width: PAGE_W,
        height: PAGE_H,
      }),
      getAnnotations: async () => [
        {
          subtype: 'Widget',
          fieldType: 'Tx',
          fieldName: 'StudentName',
          rect: [50, 700, 250, 720],
        },
      ],
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getTextContent: async () => ({ items: [] }),
    };

    const proposed = await detectFieldsOnPdfPage(mockPage as any, 1);
    expect(proposed.length).toBeGreaterThanOrEqual(1);
  });

  // TEST K — RASTER PDF REGRESSION
  it('TEST K: raster pipeline path (raster -> OCR -> candidates) continues to function correctly', async () => {
    const mockPage = {
      pageNumber: 1,
      rotate: 0,
      view: [0, 0, PAGE_W, PAGE_H],
      getViewport: () => ({ scale: 1.0, width: PAGE_W, height: PAGE_H }),
      getAnnotations: async () => [],
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getTextContent: async () => ({ items: [] }),
    };

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;

    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'Nome:', confidence: 95, bbox: { x0: 50, y0: 100, x1: 90, y1: 115 } },
      ],
      confidence: 95,
    });

    const proposed = await detectFieldsOnPdfPage(mockPage as any, 1, [], {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
    });

    // Valid OCR runner produces page processing results without errors
    expect(mockOcrRunner).toHaveBeenCalled();
  });
});
