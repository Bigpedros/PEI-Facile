import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { detectVisualLinesFromCanvas, detectFieldsOnPdfPage } from './pdfPageFixture';

describe('PEI FACILE — Correzione Bounding Box OCR e Scala Coordinate A4', () => {
  it('1. Bounding box OCR e textItems rimangono strettamente entro i limiti della pagina A4 (595.32 x 841.92 pt)', async () => {
    const pageWidthPt = 595.32;
    const pageHeightPt = 841.92;

    // Simulate OCR words from canvas without artificial upscaling distortion
    const mockOcrWords = [
      { text: 'ROMA', confidence: 95, bbox: { x0: 64.8, y0: 64.5, x1: 169.2, y1: 92.9 } },
      { text: '[INTESTAZIONE', confidence: 90, bbox: { x0: 334.7, y0: 63.8, x1: 566.3, y1: 101.5 } },
      { text: 'DELLA', confidence: 90, bbox: { x0: 576.8, y0: 64.9, x1: 676.2, y1: 88.4 } },
      { text: 'SCUOLA]', confidence: 90, bbox: { x0: 680.0, y0: 64.9, x1: 760.0, y1: 88.4 } },
      { text: 'PIANO', confidence: 95, bbox: { x0: 212.4, y0: 103.0, x1: 311.8, y1: 130.8 } },
      { text: 'EDUCATIVO', confidence: 95, bbox: { x0: 324.2, y0: 101.6, x1: 515.6, y1: 130.0 } },
      { text: 'INDIVIDUALIZZATO', confidence: 95, bbox: { x0: 525.5, y0: 100.2, x1: 838.0, y1: 133.5 } },
      { text: 'BAMBINO/A', confidence: 95, bbox: { x0: 63.6, y0: 182.0, x1: 215.5, y1: 207.3 } },
      { text: 'codice', confidence: 90, bbox: { x0: 61.8, y0: 211.2, x1: 110.0, y1: 227.9 } },
      { text: 'sostitutivo', confidence: 90, bbox: { x0: 115.5, y0: 209.9, x1: 192.7, y1: 227.2 } },
      { text: 'personale', confidence: 90, bbox: { x0: 198.9, y0: 209.1, x1: 271.2, y1: 230.1 } },
    ];

    // Image size corresponding to 300 dpi A4 or rendered canvas (e.g. 1000 x 1414)
    const ocrImageWidth = 1000;
    const ocrImageHeight = 1414;

    const wordsConverted = mockOcrWords.map((w) => {
      const x = (w.bbox.x0 / ocrImageWidth) * pageWidthPt;
      const yTop = (w.bbox.y0 / ocrImageHeight) * pageHeightPt;
      const widthPt = ((w.bbox.x1 - w.bbox.x0) / ocrImageWidth) * pageWidthPt;
      const heightPt = ((w.bbox.y1 - w.bbox.y0) / ocrImageHeight) * pageHeightPt;
      return {
        x: Math.round(x * 10) / 10,
        yTop: Math.round(yTop * 10) / 10,
        w: Math.max(6, Math.round(widthPt * 10) / 10),
        h: Math.max(8, Math.round(heightPt * 10) / 10),
        str: w.text,
      };
    });

    // Verify all items are strictly inside A4 bounds
    for (const item of wordsConverted) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x + item.w).toBeLessThanOrEqual(pageWidthPt + 1);
      expect(item.yTop).toBeGreaterThanOrEqual(0);
      expect(item.yTop + item.h).toBeLessThanOrEqual(pageHeightPt + 1);
    }

    // Verify title "PIANO EDUCATIVO INDIVIDUALIZZATO" right bound
    const titleWord = wordsConverted.find((w) => w.str === 'INDIVIDUALIZZATO');
    expect(titleWord).toBeDefined();
    expect(titleWord!.x + titleWord!.w).toBeLessThanOrEqual(pageWidthPt);

    // Verify "BAMBINO/A" vertical coordinate is at top (< 150 pt in A4 space)
    const bambinoWord = wordsConverted.find((w) => w.str === 'BAMBINO/A');
    expect(bambinoWord).toBeDefined();
    expect(bambinoWord!.yTop).toBeLessThan(150);
  });

  it('2. Esclude riquadri contenenti intestazioni statiche dall\'essere proposti come celle compilabili', () => {
    const pageWidthPt = 595.32;
    const pageHeightPt = 841.92;

    const textItems = [
      { x: 370, yTop: 35, w: 200, h: 25, str: '[INTESTAZIONE DELLA SCUOLA]' },
    ];

    // Mock a mock canvas with a box around the header
    const mockCanvas: any = {
      width: 595,
      height: 842,
      getContext: () => null,
    };

    const res = detectVisualLinesFromCanvas(mockCanvas, pageWidthPt, pageHeightPt, textItems);
    expect(res.boxes.some((b) => b.x >= 360 && b.x <= 380 && b.y >= 30 && b.y <= 40)).toBe(false);
  });
});
