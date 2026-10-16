import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { detectFieldsOnPdfPage, detectFieldsOnEntireDocument } from './assistedFieldDetectionService';
import { buildStoredPageDiagnostics, type RecognitionSnapshot } from './recognitionSnapshot';
import { createTemplateSchemaFromCandidates, saveTemplateSchema, getTemplateSchema } from './templateSchemaService';
import { resolveTemplateSource } from './templateSourceResolver';
import { computeSha256 } from './templateAcquisitionService';
import type { PageGeometry } from '../data/geometry/types';

async function nativeDocument() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText('Nome', { x: 40, y: 730, size: 12 });
  page.drawRectangle({ x: 140, y: 710, width: 300, height: 45, borderWidth: 1 });
  const bytes = new Uint8Array(await pdf.save());
  return { bytes, doc: await pdfjs.getDocument({ data: bytes.slice() }).promise };
}

describe('Esportazione delle evidenze senza riconoscimento', () => {
  it('rileva una volta, salva e riapre lo schema, esporta senza accedere al PDF o agli OCR', async () => {
    const { bytes, doc } = await nativeDocument();
    try {
      let snapshot: RecognitionSnapshot | undefined;
      const primary = vi.fn(async () => ({ text: '', words: [] }));
      const secondary = vi.fn(async () => ({ text: '', words: [] }));
      const fields = await detectFieldsOnPdfPage(await doc.getPage(1), 1, [], {
        customOcrRunner: primary, secondaryOcrRunner: secondary,
        onRecognitionSnapshot: value => { snapshot = value; },
      });
      expect(fields.length).toBeGreaterThan(0);
      expect(snapshot).toBeDefined();
      expect(snapshot!.page).not.toHaveProperty('image');
      const pages: PageGeometry[] = [{ pageNumber: 1, widthPt: 595, heightPt: 842, fields, recognitionSnapshot: snapshot }];
      const hash = await computeSha256(bytes);
      const schema = createTemplateSchemaFromCandidates('snapshot-test', 'test.pdf', hash, pages, fields as any, 'REVIEW_REQUIRED', 'A1');
      await saveTemplateSchema(schema);
      expect(JSON.parse(localStorage.getItem('pei_template_schema_snapshot-test')!).pages[0]).not.toHaveProperty('recognitionSnapshot');
      // Simulate a new module/session: schema in localStorage, large evidence in IndexedDB.
      vi.resetModules();
      const storage = await import('./templateStorage');
      const read = vi.spyOn(storage, 'getCustomTemplate').mockResolvedValue({ sourceSha256: hash, pages } as any);
      vi.stubGlobal('indexedDB', {});
      let saved;
      try {
        const freshSchemas = await import('./templateSchemaService');
        saved = await freshSchemas.getTemplateSchema('snapshot-test');
        expect(read).toHaveBeenCalledWith('snapshot-test', true);
      } finally {
        read.mockRestore();
        vi.unstubAllGlobals();
      }
      expect(saved!.pages[0].recognitionSnapshot).toEqual(snapshot);
      const reopened = await resolveTemplateSource({ providedSchema: saved!, providedBinary: bytes,
        providedBinarySha256: hash, schoolOrder: 'A1' });
      const primaryCalls = primary.mock.calls.length, secondaryCalls = secondary.mock.calls.length;
      await doc.destroy();
      // Export must work even after the PDF document has been destroyed.
      const page = reopened.geometryMapping.pages[0];
      const originalLabel = snapshot!.fields[0].label;
      page.fields[0].label = 'Modifica manuale';
      const before = JSON.stringify(page);
      for (let i = 0; i < 3; i++) {
        const trace = buildStoredPageDiagnostics(page, reopened.geometryMapping);
        expect(trace.recognitionEvidence).toMatchObject({ availability: 'available', recognitionExecutedDuringExport: false });
        expect(trace.document).not.toHaveProperty('pages');
        expect(trace.stageTimingsMs).toEqual(snapshot!.page.stageTimingsMs);
        expect(trace.recordedProposedFields![0].label).toBe(originalLabel);
        expect(trace.currentFields[0].label).toBe('Modifica manuale');
      }
      expect(JSON.stringify(page)).toBe(before);
      expect(primary).toHaveBeenCalledTimes(primaryCalls);
      expect(secondary).toHaveBeenCalledTimes(secondaryCalls);
    } finally { await doc.destroy(); }
  }, 30000);

  it('esporta i modelli precedenti dichiarando che le evidenze OCR non sono disponibili', () => {
    const legacy = { pageNumber: 1, widthPt: 595, heightPt: 842, fields: [] };
    const trace = buildStoredPageDiagnostics(legacy, { modelId: 'old', modelName: 'Modello precedente' });
    expect(trace.recognitionEvidence).toMatchObject({ availability: 'unavailable', recognitionExecutedDuringExport: false });
    expect(trace.stageTimingsMs).toBeUndefined();
    expect(trace.recordedProposedFields).toBeNull();
    expect(trace.currentFields).toEqual([]);
  });

  it('il rilevamento esplicito del documento conserva una sola evidenza per pagina', async () => {
    const { doc } = await nativeDocument();
    try {
      const callback = vi.fn();
      const result = await detectFieldsOnEntireDocument(doc, [], undefined, undefined, { onRecognitionSnapshot: callback });
      expect(callback).toHaveBeenCalledTimes(1);
      const restored = JSON.parse(JSON.stringify(result.pages[0]));
      expect(restored.recognitionSnapshot.origin).toBe('explicit-detection');
      expect(restored.recognitionSnapshot.page.pageNumber).toBe(1);
      expect(restored.fields.length).toBeGreaterThan(0);
    } finally { await doc.destroy(); }
  }, 30000);
});
