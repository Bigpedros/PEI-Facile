/**
 * @license
 * PEI FACILE — CTE-FIX-02C Diagnostic Trace Test Suite
 * Validates the runtime diagnostic export structure without modifying field detection logic.
 */

import { describe, it, expect } from 'vitest';
import { collectPageRuntimeDiagnostics, type PageRuntimeDiagnosticTrace } from '../core/assistedFieldDetectionService';

describe('CTE-FIX-02C — Page Runtime Diagnostic Trace Suite', () => {
  it('generates complete and structured runtime diagnostics from a mock PDF page proxy', async () => {
    const mockPdfPage = {
      pageNumber: 1,
      rotate: 0,
      view: [0, 0, 595.32, 841.92],
      getViewport: (_opts: { scale: number }) => ({
        scale: 1.0,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        width: 595.32,
        height: 841.92,
        viewBox: [0, 0, 595.32, 841.92],
      }),
      getAnnotations: async () => [],
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
      getTextContent: async () => ({
        items: [
          {
            str: 'BAMBINO/A: ',
            transform: [12, 0, 0, 12, 50, 700],
            width: 80,
            height: 12,
            fontName: 'g_d0_f1',
          },
        ],
      }),
    };

    const trace: PageRuntimeDiagnosticTrace = await collectPageRuntimeDiagnostics(mockPdfPage, {
      modelId: 'TEST_MODEL',
      modelName: 'Modello Test',
      pageNumber: 1,
      existingFields: [],
    });

    // Verify document metadata
    expect(trace).toBeDefined();
    expect(trace.document.pageNumber).toBe(1);
    expect(trace.document.pageWidthPt).toBeCloseTo(595.32, 1);
    expect(trace.document.pageHeightPt).toBeCloseTo(841.92, 1);
    expect(trace.document.modelId).toBe('TEST_MODEL');

    // Verify text items
    expect(trace.textItems.length).toBe(1);
    expect(trace.textItems[0].text).toBe('BAMBINO/A:');
    expect(trace.textItems[0].fontName).toBe('g_d0_f1');

    // Verify vector structures
    expect(Array.isArray(trace.vectorLines)).toBe(true);
    expect(Array.isArray(trace.vectorBoxes)).toBe(true);
    expect(Array.isArray(trace.rasterVisualLines)).toBe(true);
    expect(Array.isArray(trace.rasterBoxes)).toBe(true);

    // Verify pipeline trace
    expect(trace.pipelineTrace.steps.length).toBeGreaterThanOrEqual(2);
    expect(trace.pipelineTrace.steps.some((s) => s.step === 'getTextContent')).toBe(true);
    expect(trace.pipelineTrace.steps.some((s) => s.step === 'extractVectorGraphics')).toBe(true);
    expect(Array.isArray(trace.pipelineTrace.discarded)).toBe(true);

    // Verify final proposed fields array
    expect(Array.isArray(trace.finalProposedFields)).toBe(true);
  });
});
