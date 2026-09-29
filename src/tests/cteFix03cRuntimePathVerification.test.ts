import { describe, it, expect } from 'vitest';
import { runHybridDetectionPipeline } from '../core/canonical-template-engine/geometry/hybridDetectionEngine';
import { detectFieldsOnPdfPage } from '../core/assistedFieldDetectionService';
import type { RawLineCandidate, RawRectCandidate, RawTextItem } from '../core/fieldCandidateClustering';
import type { ModelGeometry } from '../data/geometry/types';

describe('CTE-FIX-03C: Runtime Path & Integration Verification', () => {
  it('TEST 1: Simulates Hybrid Engine -> Apply State -> Persistence -> Render Input Flow', () => {
    // 1. Mock inputs representing a canonical document page
    const pageNumber = 1;
    const pageWidthPt = 595.28;
    const pageHeightPt = 841.89;

    const rawRects: RawRectCandidate[] = [
      { x: 50, y: 100, w: 200, h: 25, isCheckbox: false },
      { x: 50, y: 150, w: 18, h: 18, isCheckbox: true },
    ];

    const rawLines: RawLineCandidate[] = [
      { x1: 50, x2: 250, y: 220, isVertical: false, source: 'VECTOR' },
    ];

    const textItems: RawTextItem[] = [
      { str: 'Nome:', x: 55, yTop: 105, w: 35, h: 12 },
      { str: 'Accetto', x: 75, yTop: 152, w: 40, h: 12 },
      { str: 'Indirizzo:', x: 10, yTop: 220, w: 35, h: 12 },
    ];

    // Step A: Run Hybrid Detection Engine
    const hybridOutput = runHybridDetectionPipeline({
      pageNumber,
      pageWidthPt,
      pageHeightPt,
      rawLines,
      rawRects,
      textItems,
    });

    const fieldsProducedByHybridEngine = hybridOutput.authoritativeFields;
    expect(fieldsProducedByHybridEngine.length).toBeGreaterThan(0);

    // Step B: Apply State (Simulating TemplateCalibrationWorkspace setModelState)
    const initialModel: ModelGeometry = {
      modelId: 'TEST_ROMA_PEI_01',
      modelName: 'PEI Comune di Roma Test',
      schoolOrder: 'A1',
      sourcePdf: 'pei_roma_p1.pdf',
      sourcePdfSha256: 'abc123hash',
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          widthPt: pageWidthPt,
          heightPt: pageHeightPt,
          fields: [],
        },
      ],
      schemaVersion: '1.0.0',
    };

    const fieldsAfterApply = [...fieldsProducedByHybridEngine];
    const modelAfterApply: ModelGeometry = JSON.parse(JSON.stringify(initialModel));
    modelAfterApply.pages[0].fields = fieldsAfterApply;

    // Step C: Persistence (Simulating IndexedDB / JSON schema storage)
    const serialized = JSON.stringify(modelAfterApply);
    const modelAfterPersistence: ModelGeometry = JSON.parse(serialized);
    const fieldsAfterPersistence = modelAfterPersistence.pages[0].fields;

    // Step D: Render Input (Simulating Calibrator Canvas Overlay Renderer)
    const fieldsSeenByRenderer = modelAfterPersistence.pages[0].fields;

    // Step E: Verification
    expect(fieldsSeenByRenderer.length).toBe(fieldsProducedByHybridEngine.length);
    fieldsSeenByRenderer.forEach((renderedField, idx) => {
      const produced = fieldsProducedByHybridEngine[idx];
      expect(renderedField.fieldId).toBe(produced.fieldId);
      expect(renderedField.pageNumber).toBe(produced.pageNumber);
      expect(renderedField.xPt).toBe(produced.xPt);
      expect(renderedField.yPt).toBe(produced.yPt);
      expect(renderedField.widthPt).toBe(produced.widthPt);
      expect(renderedField.heightPt).toBe(produced.heightPt);
      expect(renderedField.semanticKey).toBe(produced.semanticKey);
      expect(renderedField.label).toBe(produced.label);
    });
  });

  it('TEST 2: Verifies whether assistedFieldDetectionService invokes Legacy vs Hybrid Engine', async () => {
    // Mock PDF page proxy with minimal operator list and text content
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({
        items: [
          { str: 'Alunno:', transform: [10, 0, 0, 10, 50, 700], width: 40, height: 10 },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
      getAnnotations: async () => [],
    };

    // Spy on console.log to trace [03C][ENGINE] logs
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
      origLog(...args);
    };

    try {
      await detectFieldsOnPdfPage(mockPageProxy as any, 1, []);
    } finally {
      console.log = origLog;
    }

    const engineLogs = logs.filter((l) => l.includes('[03C][ENGINE]'));
    const legacyLogs = logs.filter((l) => l.includes('[03C][LEGACY_ENGINE]'));

    expect(legacyLogs.length).toBeGreaterThan(0);
    expect(legacyLogs[0]).toContain('LEGACY_DETECTION_ENGINE_CALLED = false');
    expect(engineLogs.some((l) => l.includes('HYBRID_DETECTION_ENGINE_CALLED = true'))).toBe(true);
  });
});
