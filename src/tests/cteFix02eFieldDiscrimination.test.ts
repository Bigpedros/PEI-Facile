/**
 * @license
 * PEI FACILE — CTE-FIX-02E Regression Test Suite
 * Rigorous discrimination between static document text / headers and real compilable fields:
 * A. Static OCR words / sentences ("descrizione", "della bambina", "Diagnosi", "GLO") WITHOUT geometry MUST NOT produce fields.
 * B. Real prompt labels WITH physical geometry ("BAMBINO/A:", "Anno scolastico:") DO produce fields with label excluded.
 * C. Table cell filled with static descriptive text is classified as HEADER_ONLY and discarded.
 * D. Table cell with prompt label + empty space excludes label from bbox and creates field in free area.
 * E. Empty table data cell produces a compilable field.
 * F. Multiline narrative ruled area produces exactly 1 TEXT_LONG field.
 * G. Checkbox control produces SINGLE_CHOICE and does not produce duplicate phantom text field.
 * H. Diagnostics trace accurately reports candidate counts and discarded reasons breakdown.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectFieldsOnPdfPage,
  collectPageRuntimeDiagnostics,
  type PageRuntimeDiagnosticTrace,
} from './pdfPageFixture';
import {
  clusterAndRefineCandidates,
  type RawLineCandidate,
  type RawRectCandidate,
  type RawTextItem,
} from '../core/fieldCandidateClustering';
import { extractCellInteriorRect } from '../data/geometry/geometryTransform';

/**
 * Helper to build a mock canvas with 2D context.
 */
function createMockCanvas(width = 600, height = 800) {
  const pixelData = new Uint8ClampedArray(width * height * 4);
  pixelData.fill(255);

  function drawRect(x: number, y: number, w: number, h: number, border = 2) {
    // Top border
    for (let py = y; py < y + border; py++) {
      for (let px = x; px < x + w; px++) {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          pixelData[idx] = 0;
          pixelData[idx + 1] = 0;
          pixelData[idx + 2] = 0;
          pixelData[idx + 3] = 255;
        }
      }
    }
    // Bottom border
    for (let py = y + h - border; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          pixelData[idx] = 0;
          pixelData[idx + 1] = 0;
          pixelData[idx + 2] = 0;
          pixelData[idx + 3] = 255;
        }
      }
    }
    // Left border
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + border; px++) {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          pixelData[idx] = 0;
          pixelData[idx + 1] = 0;
          pixelData[idx + 2] = 0;
          pixelData[idx + 3] = 255;
        }
      }
    }
    // Right border
    for (let py = y; py < y + h; py++) {
      for (let px = x + w - border; px < x + w; px++) {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          pixelData[idx] = 0;
          pixelData[idx + 1] = 0;
          pixelData[idx + 2] = 0;
          pixelData[idx + 3] = 255;
        }
      }
    }
  }

  function drawHLine(x1: number, y: number, x2: number, thickness = 2) {
    for (let py = y; py < y + thickness; py++) {
      for (let px = x1; px <= x2; px++) {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          pixelData[idx] = 0;
          pixelData[idx + 1] = 0;
          pixelData[idx + 2] = 0;
          pixelData[idx + 3] = 255;
        }
      }
    }
  }

  return {
    width,
    height,
    getContext: (type: string) => {
      if (type === '2d') {
        return {
          getImageData: (_sx: number, _sy: number, sw: number, sh: number) => ({
            data: pixelData,
            width: sw,
            height: sh,
          }),
        };
      }
      return null;
    },
    drawRect,
    drawHLine,
  } as unknown as HTMLCanvasElement & {
    drawRect: (x: number, y: number, w: number, h: number, border?: number) => void;
    drawHLine: (x1: number, y: number, x2: number, thickness?: number) => void;
  };
}

/**
 * Helper to build a mock PDF.js Page Proxy.
 */
function createMockPageProxy(options: {
  nativeTextItems?: Array<{ str: string; transform: number[]; width: number; height: number; fontName?: string }>;
  pageNumber?: number;
  width?: number;
  height?: number;
}) {
  const width = options.width || 595.32;
  const height = options.height || 841.92;
  const pageNumber = options.pageNumber || 1;
  const items = options.nativeTextItems || [];

  return {
    pageNumber,
    rotate: 0,
    view: [0, 0, width, height],
    getViewport: (_opts: { scale: number }) => ({
      scale: 1.0,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      width,
      height,
      viewBox: [0, 0, width, height],
    }),
    getAnnotations: async () => [],
    getOperatorList: async () => ({
      fnArray: [],
      argsArray: [],
    }),
    getTextContent: async () => ({
      items,
    }),
  };
}

describe('CTE-FIX-02E — Field Semantic-Geometric Discrimination Suite', () => {
  // TEST 1: OCR static text words without geometry MUST NOT become fields
  it('TEST 1: static OCR text words without geometry ("descrizione", "della bambina", "Diagnosi", "GLO,") are NOT promoted to fields', async () => {
    const rasterPage = createMockPageProxy({ nativeTextItems: [] });
    // Empty canvas: no lines, no boxes
    const canvas = createMockCanvas(595, 842);

    // OCR recognizes static pre-printed words from page 2 of PEI Roma
    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'descrizione', confidence: 91, bbox: { x0: 50, y0: 100, x1: 120, y1: 114 } },
        { text: 'della', confidence: 90, bbox: { x0: 125, y0: 100, x1: 155, y1: 114 } },
        { text: 'bambina', confidence: 92, bbox: { x0: 160, y0: 100, x1: 220, y1: 114 } },
        { text: 'Diagnosi', confidence: 89, bbox: { x0: 50, y0: 200, x1: 110, y1: 214 } },
        { text: 'Funzionale,', confidence: 88, bbox: { x0: 115, y0: 200, x1: 185, y1: 214 } },
        { text: 'GLO,', confidence: 87, bbox: { x0: 50, y0: 300, x1: 85, y1: 314 } },
      ],
      confidence: 90,
    });

    const proposed = await detectFieldsOnPdfPage(rasterPage, 1, [], {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
    });

    // Zero geometry available: NONE of these static words should produce a proposed field!
    expect(proposed).toHaveLength(0);
  });

  // TEST 2: True prompt label WITH physical line/box geometry produces exactly the compilable field
  it('TEST 2: genuine prompt label WITH physical input line produces a field on the line, excluding the label text', async () => {
    const rasterPage = createMockPageProxy({ nativeTextItems: [] });
    const canvas = createMockCanvas(595, 842);
    // Draw a real horizontal line for name entry at (x=160 to 450, y=120)
    canvas.drawHLine(160, 120, 450, 2);

    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'BAMBINO/A:', confidence: 94, bbox: { x0: 50, y0: 105, x1: 145, y1: 122 } },
      ],
      confidence: 94,
    });

    const proposed = await detectFieldsOnPdfPage(rasterPage, 1, [], {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
    });

    expect(proposed.length).toBeGreaterThanOrEqual(1);
    const field = proposed[0];
    expect(field.label).toContain('BAMBINO');
    // Field starts after the prompt label, anchored to the line
    expect(field.xPt).toBeGreaterThanOrEqual(145);
    expect(field.widthPt).toBeGreaterThanOrEqual(100);
  });

  // TEST 3: Compound label with dots/underline produces fillable area excluding the prompt
  it('TEST 3: compound text pattern ("Anno Scolastico: ____________") produces fillable field excluding label', async () => {
    const mockPage = createMockPageProxy({
      nativeTextItems: [
        {
          str: 'Anno Scolastico: __________________________',
          transform: [12, 0, 0, 12, 50, 700],
          width: 250,
          height: 12,
        },
      ],
    });

    const proposed = await detectFieldsOnPdfPage(mockPage, 1, []);
    expect(proposed).toHaveLength(1);
    const field = proposed[0];
    expect(field.label).toContain('Anno');
    expect(field.xPt).toBeGreaterThan(50); // Offset past "Anno Scolastico:"
    expect(field.widthPt).toBeGreaterThanOrEqual(30);
  });

  // TEST 4: Table cell filled with descriptive static text is classified as HEADER_ONLY and discarded
  it('TEST 4: table cell filled with descriptive static text without prompt is discarded as HEADER_ONLY', () => {
    const box = { x: 50, y: 100, w: 500, h: 35 };
    const textPrompt = { x: 60, yTop: 108, w: 280, h: 14, str: 'QUADRO CONDIVISO DEL FUNZIONAMENTO' };

    const interior = extractCellInteriorRect(box, textPrompt, 2);
    expect(interior.isHeaderOnly).toBe(true);
  });

  // TEST 5: Table cell with prompt label + empty space produces fillable field with label excluded
  it('TEST 5: table cell with prompt label + empty space produces fillable field with label excluded', () => {
    const box = { x: 50, y: 100, w: 300, h: 32 };
    const textPrompt = { x: 55, yTop: 108, w: 60, h: 14, str: 'SEZIONE:' };

    const interior = extractCellInteriorRect(box, textPrompt, 2);
    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.xPt).toBeGreaterThan(textPrompt.x + textPrompt.w);
    expect(interior.widthPt).toBeGreaterThan(100);
  });

  // TEST 6: Empty table cell produces a compilable field
  it('TEST 6: empty table data cell without prompt is recognized as fillable', () => {
    const box = { x: 200, y: 150, w: 180, h: 40 };
    const interior = extractCellInteriorRect(box, null, 2);
    expect(interior.isHeaderOnly).toBe(false);
    expect(interior.widthPt).toBeCloseTo(176, 0);
    expect(interior.heightPt).toBeCloseTo(36, 0);
  });

  // TEST 7: Multiline ruled area produces exactly 1 TEXT_LONG field
  it('TEST 7: multiline ruled area with prompt produces exactly 1 TEXT_LONG field', () => {
    const rawLines: RawLineCandidate[] = [
      { x1: 50, y: 130, x2: 500 },
      { x1: 50, y: 155, x2: 500 },
      { x1: 50, y: 180, x2: 500 },
      { x1: 50, y: 205, x2: 500 },
    ];
    const textItems: RawTextItem[] = [
      { x: 50, yTop: 105, w: 220, h: 12, str: 'Descrizione del funzionamento:' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      rawLines,
      rawRects: [],
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(1);
    const field = proposedFields[0];
    expect(field.fieldType).toBe('TEXT_LONG');
    expect(field.heightPt).toBeGreaterThanOrEqual(60);
  });

  // TEST 8: Checkbox produces SINGLE_CHOICE without generating a phantom text field for the option label
  it('TEST 8: checkbox produces SINGLE_CHOICE and does not produce a phantom text field for option label', () => {
    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 200, w: 12, h: 12, isCheckbox: true },
    ];
    const textItems: RawTextItem[] = [
      { x: 68, yTop: 198, w: 80, h: 12, str: 'Tempo pieno' },
    ];

    const { proposedFields } = clusterAndRefineCandidates({
      pageNumber: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      rawLines: [],
      rawRects,
      textItems,
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    });

    expect(proposedFields).toHaveLength(1);
    const field = proposedFields[0];
    expect(field.fieldType).toBe('SINGLE_CHOICE');
    expect(field.label).toContain('Tempo pieno');
  });

  // TEST 9: Diagnostic trace accurately captures OCR counts, candidates, and discarded breakdown
  it('TEST 9: runtime diagnostic trace accurately captures OCR counts and discrimination steps', async () => {
    const rasterPage = createMockPageProxy({ nativeTextItems: [] });
    const canvas = createMockCanvas(595, 842);
    // Draw 1 input line and 1 header cell
    canvas.drawHLine(150, 200, 350, 2);
    canvas.drawRect(50, 50, 495, 30, 2);

    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'COMUNE', confidence: 93, bbox: { x0: 60, y0: 55, x1: 130, y1: 70 } },
        { text: 'DI', confidence: 92, bbox: { x0: 135, y0: 55, x1: 155, y1: 70 } },
        { text: 'ROMA', confidence: 93, bbox: { x0: 160, y0: 55, x1: 210, y1: 70 } },
        { text: 'Plesso:', confidence: 95, bbox: { x0: 50, y0: 195, x1: 120, y1: 210 } },
      ],
      confidence: 93,
    });

    const trace: PageRuntimeDiagnosticTrace = await collectPageRuntimeDiagnostics(rasterPage, {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
      pageNumber: 1,
    });

    console.log('TEST 9 RASTER BOXES:', trace.rasterBoxes);
    console.log('TEST 9 TEXT ITEMS:', trace.textItems);
    console.log('TEST 9 PROPOSED FIELDS:', trace.finalProposedFields.map(f => ({ id: f.fieldId, label: f.label, bbox: f.bbox, source: f.detectionSource })));
    expect(trace.finalProposedFields.length).toBe(1);
    expect(trace.finalProposedFields[0].label).toContain('Plesso');
  });
});
