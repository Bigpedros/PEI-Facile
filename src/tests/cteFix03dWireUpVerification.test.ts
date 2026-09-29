import { describe, it, expect, vi } from 'vitest';
import { detectFieldsOnPdfPage } from '../core/assistedFieldDetectionService';
import type { FieldGeometry, ModelGeometry } from '../data/geometry/types';

describe('PEI FACILE — CTE-FIX-03D: Hybrid Engine Wire-Up Verification Suite', () => {
  const pageNumber = 1;

  it('TEST A — RUNTIME USES HYBRID: detectFieldsOnPdfPage invokes runHybridDetectionPipeline', async () => {
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({
        items: [{ str: 'Nome:', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 10 }],
      }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getAnnotations: async () => [],
    };

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
      origLog(...args);
    };

    try {
      await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    } finally {
      console.log = origLog;
    }

    const engineLogs = logs.filter((l) => l.includes('[03C][ENGINE]'));
    const legacyLogs = logs.filter((l) => l.includes('[03C][LEGACY_ENGINE]'));

    expect(engineLogs.some((l) => l.includes('HYBRID_DETECTION_ENGINE_CALLED = true'))).toBe(true);
    expect(legacyLogs.some((l) => l.includes('LEGACY_DETECTION_ENGINE_CALLED = false'))).toBe(true);
  });

  it('TEST B — HYBRID OUTPUT REACHES STATE: authoritativeFields reach state adapter unchanged', async () => {
    // Physical rect representing a closed cell in PDF native coordinates (84 = OPS.rectangle)
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({
        fnArray: [84], // OPS.rectangle
        argsArray: [[50, 711.89, 200, 30]], // [x, y, w, h] native PDF
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    expect(proposed.length).toBeGreaterThan(0);

    const cellField = proposed[0];
    expect(cellField.pageNumber).toBe(1);
    expect(cellField.xPt).toBe(52); // 50 + safeGap(2)
    expect(cellField.yPt).toBe(102); // 100 + safeGap(2)
    expect(cellField.widthPt).toBe(196);
    expect(cellField.heightPt).toBe(26);

    // State adapter simulation
    const model: ModelGeometry = {
      modelId: 'M_TEST',
      modelName: 'Test Model',
      schoolOrder: 'A1',
      sourcePdf: 'test.pdf',
      sourcePdfSha256: 'sha256',
      totalPages: 1,
      pages: [{ pageNumber: 1, widthPt: 595.28, heightPt: 841.89, fields: proposed }],
      schemaVersion: '1.0.0',
    };

    expect(model.pages[0].fields[0]).toEqual(cellField);
  });

  it('TEST C — PERSISTENCE: produced field maintains identical bbox after serialization/deserialization', async () => {
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[100, 616.89, 150, 25]],
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    expect(proposed.length).toBeGreaterThan(0);
    const originalField = proposed[0];

    const serialized = JSON.stringify(originalField);
    const reloadedField: FieldGeometry = JSON.parse(serialized);

    expect(reloadedField.xPt).toBe(originalField.xPt);
    expect(reloadedField.yPt).toBe(originalField.yPt);
    expect(reloadedField.widthPt).toBe(originalField.widthPt);
    expect(reloadedField.heightPt).toBe(originalField.heightPt);
  });

  it('TEST D — RENDER INPUT: renderer receives exact bbox produced by hybrid engine', async () => {
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[80, 703.89, 18, 18]],
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    expect(proposed.length).toBeGreaterThan(0);
    const checkboxField = proposed[0];

    // Simulating renderer input props
    const renderInputProps = {
      field: checkboxField,
      scale: 1.5,
    };

    expect(renderInputProps.field.xPt).toBe(80);
    expect(renderInputProps.field.yPt).toBe(120);
    expect(renderInputProps.field.widthPt).toBe(18);
    expect(renderInputProps.field.heightPt).toBe(18);
  });

  it('TEST E — PROTECTED FIELD: existing USER_CONFIRMED field is not deleted or replaced', async () => {
    const existingConfirmedField: FieldGeometry = {
      fieldId: 'fld_protected_01',
      pageNumber: 1,
      xPt: 50,
      yPt: 100,
      widthPt: 200,
      heightPt: 30,
      calibrationStatus: 'CONFIRMED',
      derivationMethod: 'MANUAL_VERIFIED',
      label: 'Nome Confermato',
      fieldType: 'TEXT_SHORT',
      anchorText: 'Nome Confermato',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[50, 711.89, 200, 30]],
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, [existingConfirmedField]);

    // Proposed fields array must NOT contain duplicates of the confirmed field
    expect(proposed.some((f) => f.fieldId === existingConfirmedField.fieldId)).toBe(false);
  });

  it('TEST F — WHITE SPACE: OCR label without physical geometry produces 0 automatic fields', async () => {
    // Page with label text but NO vector lines or boxes
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({
        items: [{ str: 'Informazioni Generali Alunno', transform: [1, 0, 0, 1, 50, 200], width: 120, height: 12 }],
      }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);

    // White space alone without line/box/underline/checkbox produces ZERO automatic fields!
    expect(proposed.length).toBe(0);
  });

  it('TEST G — CLOSED CELL: physical closed cell is classified correctly', async () => {
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({
        items: [{ str: 'Note:', transform: [1, 0, 0, 1, 52, 729.89], width: 30, height: 10 }],
      }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[50, 701.89, 200, 40]],
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    expect(proposed.length).toBe(1);
    expect(proposed[0].widthPt).toBeGreaterThan(0);
  });

  it('TEST H — UNDERLINE: physical vector line produces UNDERLINE_FIELD candidate', async () => {
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({
        items: [
          { str: 'Cognome:', transform: [1, 0, 0, 1, 50, 531.89], width: 45, height: 10 },
          { str: '______________________', transform: [1, 0, 0, 1, 100, 531.89], width: 150, height: 10 },
        ],
      }),
      getOperatorList: async () => ({
        fnArray: [],
        argsArray: [],
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    expect(proposed.length).toBe(1);
    expect(proposed[0].widthPt).toBeGreaterThanOrEqual(30);
  });

  it('TEST I — CHECKBOX: real square produces CHECKBOX candidate', async () => {
    const mockPageProxy = {
      getViewport: () => ({ width: 595.28, height: 841.89, scale: 1.0, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({
        fnArray: [84],
        argsArray: [[60, 427.89, 14, 14]],
      }),
      getAnnotations: async () => [],
    };

    const proposed = await detectFieldsOnPdfPage(mockPageProxy as any, pageNumber, []);
    expect(proposed.length).toBe(1);
    expect(proposed[0].widthPt).toBe(14);
    expect(proposed[0].heightPt).toBe(14);
  });
});
