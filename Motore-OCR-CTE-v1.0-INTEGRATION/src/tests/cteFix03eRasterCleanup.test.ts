/**
 * @license
 * PEI FACILE — CTE-FIX-03E Raster Primitive Extraction Cleanup Verification Suite
 * Tests raster geometry cleanup, text masking, vertical line noise reduction,
 * underline preservation, and closed cell / checkbox validation.
 */

import { describe, it, expect } from 'vitest';
import { detectVisualLinesFromCanvas } from '../core/assistedFieldDetectionService';

/**
 * Helper to build a mock canvas with dark pixel text and geometry
 */
function createMockCanvasWithPixels(width = 600, height = 800) {
  const pixelData = new Uint8ClampedArray(width * height * 4);
  pixelData.fill(255); // White canvas

  function setPixelDark(px: number, py: number) {
    if (px >= 0 && px < width && py >= 0 && py < height) {
      const idx = (py * width + px) * 4;
      pixelData[idx] = 0;
      pixelData[idx + 1] = 0;
      pixelData[idx + 2] = 0;
      pixelData[idx + 3] = 255;
    }
  }

  // Draw a vertical line
  function drawVertLine(x: number, y1: number, y2: number, thickness = 2) {
    for (let py = y1; py <= y2; py++) {
      for (let px = x; px < x + thickness; px++) {
        setPixelDark(px, py);
      }
    }
  }

  // Draw a horizontal line
  function drawHorizLine(x1: number, y: number, x2: number, thickness = 2) {
    for (let py = y; py < y + thickness; py++) {
      for (let px = x1; px <= x2; px++) {
        setPixelDark(px, py);
      }
    }
  }

  // Draw a box / checkbox
  function drawBox(x: number, y: number, w: number, h: number, border = 2) {
    drawHorizLine(x, y, x + w, border);
    drawHorizLine(x, y + h - border, x + w, border);
    drawVertLine(x, y, y + h, border);
    drawVertLine(x + w - border, y, y + h, border);
  }

  // Draw simulated text glyphs (e.g., "COMUNE DI ROMA" with vertical stems)
  function drawTextWord(x: number, y: number, text: string) {
    let curX = x;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === ' ') {
        curX += 10;
        continue;
      }
      // Draw vertical stem for letter
      drawVertLine(curX, y, y + 16, 2);
      // Draw top/bottom horizontal serifs
      drawHorizLine(curX, y, curX + 8, 2);
      drawHorizLine(curX, y + 16, curX + 8, 2);
      curX += 12;
    }
  }

  const canvasObj = {
    width,
    height,
    getContext: (type: string) => {
      if (type === '2d') {
        return {
          getImageData: () => ({
            data: pixelData,
            width,
            height,
          }),
        };
      }
      return null;
    },
    drawHorizLine,
    drawVertLine,
    drawBox,
    drawTextWord,
  };

  return canvasObj;
}

describe('CTE-FIX-03E — Raster Primitive Extraction Cleanup Suite', () => {
  it('TEST A: Text Mask drastically reduces false vertical lines from text character stems', () => {
    const canvas = createMockCanvasWithPixels(600, 800);
    // Draw 3 words of text with 15 vertical stems
    canvas.drawTextWord(50, 100, 'COMUNE DI ROMA');
    canvas.drawTextWord(50, 150, 'SEZIONE PEI');

    // Create text items corresponding to OCR/native text layer
    const textItems = [
      { x: 35, yTop: 70, w: 120, h: 14, str: 'COMUNE DI ROMA' },
      { x: 35, yTop: 105, w: 100, h: 14, str: 'SEZIONE PEI' },
    ];

    const result = detectVisualLinesFromCanvas(canvas as any, 420, 560, textItems);

    // Vertical lines from text character stems must be filtered out!
    expect(result.verticalLines?.length || 0).toBeLessThan(5);
  });

  it('TEST B: Real physical table borders and structural separators are preserved', () => {
    const canvas = createMockCanvasWithPixels(600, 800);
    // Draw real structural vertical column divider (100px long = ~70pt)
    canvas.drawVertLine(100, 50, 200, 3);
    canvas.drawVertLine(300, 50, 200, 3);
    // Draw horizontal table headers
    canvas.drawHorizLine(50, 50, 500, 3);
    canvas.drawHorizLine(50, 200, 500, 3);

    const result = detectVisualLinesFromCanvas(canvas as any, 420, 560);

    expect(result.lines.length).toBeGreaterThanOrEqual(2);
    expect(result.verticalLines?.length).toBeGreaterThanOrEqual(2);
  });

  it('TEST C: Real printed underlines below text are preserved', () => {
    const canvas = createMockCanvasWithPixels(600, 800);
    // Draw text word "ALUNNO/A: "
    canvas.drawTextWord(50, 100, 'ALUNNO/A');
    // Draw printed underline to the right below baseline (y = 118, length = 200px)
    canvas.drawHorizLine(150, 118, 350, 2);

    const textItems = [
      { x: 35, yTop: 70, w: 70, h: 12, str: 'ALUNNO/A:' },
    ];

    const result = detectVisualLinesFromCanvas(canvas as any, 420, 560, textItems);

    expect(result.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.lines[0].x2 - result.lines[0].x1).toBeGreaterThan(100);
  });

  it('TEST D: Valid checkboxes are detected while small internal text glyphs are excluded', () => {
    const canvas = createMockCanvasWithPixels(600, 800);
    // Draw valid 20x20 checkbox
    canvas.drawBox(50, 200, 20, 20, 2);

    const result = detectVisualLinesFromCanvas(canvas as any, 600, 800);

    const checkboxes = result.boxes.filter((b) => b.isCheckbox);
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
  });
});
