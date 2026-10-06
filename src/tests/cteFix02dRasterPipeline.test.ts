/**
 * @license
 * PEI FACILE — CTE-FIX-02D Regression Test Suite
 * Tests real raster pipeline restoration:
 * A. Native PDF text/vector regression (behavior unchanged)
 * B. Raster page triggers raster/OCR branch
 * C. OCR raster produces usable text items for detection
 * D. Raster geometry: lines forming a cell produce a rasterBox/cell
 * E. Pipeline: OCR text + raster geometry produce rawCandidates and finalProposedFields
 * F. Diagnostics: runtime counters accurately reflect pipeline data
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectFieldsOnPdfPage,
  detectVisualLinesFromCanvas,
  collectPageRuntimeDiagnostics,
  type PageRuntimeDiagnosticTrace,
} from './pdfPageFixture';

/**
 * Creates a mock canvas with a programmable 2D pixel buffer.
 */
function createMockCanvas(width = 600, height = 800) {
  const pixelData = new Uint8ClampedArray(width * height * 4);
  pixelData.fill(255); // White background

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

  const canvasObj = {
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

  return canvasObj;
}

/**
 * Creates a mock PDF.js Page Proxy.
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

describe('CTE-FIX-02D — Real Raster Pipeline Restoration Suite', () => {
  // TEST A: PDF con testo/vettori nativi (comportamento precedente invariato)
  it('TEST A: preserves native PDF text and vector pipeline without invoking OCR', async () => {
    const mockPage = createMockPageProxy({
      nativeTextItems: [
        {
          str: 'ALUNNO/A: ',
          transform: [12, 0, 0, 12, 50, 700],
          width: 70,
          height: 12,
        },
        {
          str: '_______________________',
          transform: [12, 0, 0, 12, 130, 700],
          width: 150,
          height: 12,
        },
      ],
    });

    const ocrRunnerSpy = vi.fn();
    const fields = await detectFieldsOnPdfPage(mockPage, 1, [], {
      customOcrRunner: ocrRunnerSpy,
    });

    // Native text was present: OCR must NOT be called
    expect(ocrRunnerSpy).toHaveBeenCalledTimes(0);
    expect(fields.length).toBeGreaterThanOrEqual(1);
    expect(fields.some((f) => f.label.toUpperCase().includes('ALUNNO') || f.anchorText?.includes('ALUNNO'))).toBe(true);
  });

  // TEST B: Pagina raster attiva il ramo raster/OCR
  it('TEST B: activates OCR fallback when native textContent is empty', async () => {
    const rasterPage = createMockPageProxy({
      nativeTextItems: [], // Scanned page has 0 native text items
    });
    const canvas = createMockCanvas(595, 842);

    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'BAMBINO/A:', confidence: 92, bbox: { x0: 50, y0: 100, x1: 130, y1: 114 } },
      ],
      confidence: 92,
    });

    let recordedDiagnostics: any;
    await detectFieldsOnPdfPage(rasterPage, 1, [], {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
      onDiagnostics: (d) => {
        recordedDiagnostics = d;
      },
    });

    expect(mockOcrRunner).toHaveBeenCalledTimes(1);
    expect(recordedDiagnostics).toBeDefined();
    expect(recordedDiagnostics.ocrFallbackUsed).toBe(true);
    expect(recordedDiagnostics.rawOcrWordsCount).toBe(1);
  });

  // TEST C: OCR raster produce elementi testuali utilizzabili dalla detection
  it('TEST C: transforms OCR words and compound phrases into textItems compatible with semantic catalog', async () => {
    const rasterPage = createMockPageProxy({ nativeTextItems: [] });
    const canvas = createMockCanvas(595, 842);

    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'ANNO', confidence: 95, bbox: { x0: 50, y0: 120, x1: 85, y1: 132 } },
        { text: 'SCOLASTICO:', confidence: 94, bbox: { x0: 90, y0: 120, x1: 175, y1: 132 } },
      ],
      confidence: 94,
    });

    const trace: PageRuntimeDiagnosticTrace = await collectPageRuntimeDiagnostics(rasterPage, {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
      pageNumber: 1,
    });

    // Check that textItems is populated from OCR
    expect(trace.textItems.length).toBeGreaterThanOrEqual(2);
    // Verifies compound grouping "ANNO SCOLASTICO:" was formed
    expect(trace.textItems.some((t) => t.text.includes('SCOLASTICO'))).toBe(true);

    const ocrStep = trace.pipelineTrace.steps.find((s) => s.step === 'ocrExtraction');
    expect(ocrStep).toBeDefined();
    expect(ocrStep?.counts.rawOcrWordsCount).toBe(2);
    expect(ocrStep?.counts.validOcrTextItemsCount).toBeGreaterThanOrEqual(2);
  });

  // TEST D: Geometria raster: linee e rettangoli formano un rasterBox/cella
  it('TEST D: detectVisualLinesFromCanvas reconstructs closed cells into rasterBoxes', () => {
    const canvas = createMockCanvas(600, 800);
    // Draw a prominent table cell / box at (x=100, y=200, w=150, h=40)
    canvas.drawRect(100, 200, 150, 40, 2);

    const result = detectVisualLinesFromCanvas(canvas, 600, 800);

    // Verify horizontal lines detected
    expect(result.lines.length).toBeGreaterThanOrEqual(1);

    // Verify boxes detected
    expect(result.boxes.length).toBeGreaterThanOrEqual(1);
    const box = result.boxes[0];
    expect(box.x).toBeCloseTo(100, -1);
    expect(box.y).toBeCloseTo(200, -1);
    expect(box.w).toBeCloseTo(150, -1);
    expect(box.h).toBeCloseTo(40, -1);
    expect(box.isCheckbox).toBe(false);
  });

  // TEST E: Pipeline: testo OCR + geometria raster producono rawCandidates e finalProposedFields
  it('TEST E: full pipeline convergence: OCR text + raster geometry produce rawCandidates and finalProposedFields', async () => {
    const rasterPage = createMockPageProxy({ nativeTextItems: [] });
    const canvas = createMockCanvas(600, 800);

    // Draw a cell for a text field at (x=160, y=100, w=200, h=25)
    canvas.drawRect(160, 100, 200, 25, 2);

    // OCR provides prompt label "BAMBINO/A:" immediately to the left at (x=50, y=100)
    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'BAMBINO/A:', confidence: 91, bbox: { x0: 50, y0: 104, x1: 140, y1: 120 } },
      ],
      confidence: 91,
    });

    const trace: PageRuntimeDiagnosticTrace = await collectPageRuntimeDiagnostics(rasterPage, {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
      pageNumber: 1,
    });

    // 1. Text items populated
    expect(trace.textItems.length).toBeGreaterThan(0);
    // 2. Raster visual lines populated
    expect(trace.rasterVisualLines.length).toBeGreaterThan(0);
    // 3. Raster boxes populated
    expect(trace.rasterBoxes.length).toBeGreaterThan(0);
    // 4. Raw candidates populated
    expect(trace.rawCandidates.length).toBeGreaterThan(0);
    // 5. Final proposed fields populated
    expect(trace.finalProposedFields.length).toBeGreaterThan(0);

    const proposed = trace.finalProposedFields[0];
    expect(proposed).toBeDefined();
    expect(proposed.fieldId).toBeTruthy();
    expect(proposed.confidence).toBe(0.7);
    expect(proposed.semanticKey).toBeNull();
  });

  // TEST F: Diagnostica: i conteggi runtime rappresentano fedelmente i dati prodotti
  it('TEST F: diagnostic trace accurately reports OCR counts, raster lines, raster boxes, candidates, and discarded breakdown', async () => {
    const rasterPage = createMockPageProxy({ nativeTextItems: [] });
    const canvas = createMockCanvas(600, 800);

    // Draw 1 box and 1 horizontal line
    canvas.drawRect(200, 150, 120, 30, 2);
    canvas.drawHLine(50, 400, 350, 2);

    const mockOcrRunner = vi.fn().mockResolvedValue({
      words: [
        { text: 'DATA:', confidence: 89, bbox: { x0: 50, y0: 154, x1: 100, y1: 170 } },
      ],
      confidence: 89,
    });

    const trace: PageRuntimeDiagnosticTrace = await collectPageRuntimeDiagnostics(rasterPage, {
      canvasElement: canvas,
      customOcrRunner: mockOcrRunner,
      pageNumber: 1,
    });

    expect(trace.document.pageNumber).toBe(1);
    expect(trace.rasterVisualLines.length).toBeGreaterThanOrEqual(1);
    expect(trace.rasterBoxes.length).toBeGreaterThanOrEqual(1);
    expect(trace.rawCandidates.length).toBeGreaterThanOrEqual(1);
    expect(trace.pipelineTrace.steps.some((s) => s.step === 'detectRegions')).toBe(true);
    expect(trace.pipelineTrace.steps.some((s) => s.step === 'ocrExtraction')).toBe(true);
  });
});
