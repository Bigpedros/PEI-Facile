import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCustomTemplate,
  getNormalizedTemplatePdfBinary,
  getOriginalTemplatePdfBinary,
  clearAllCustomTemplates,
} from '../core/templateStorage';
import { computeSha256 } from '../core/templateSourceResolver';
import type { PersistedTemplateRecord } from '../core/templateAcquisitionTypes';

describe('PEI FACILE — Download PDF Elaborato & Originale Verification', () => {
  beforeEach(async () => {
    await clearAllCustomTemplates();
  });

  it('salva separatamente binario originale e binario normalizzato/rettificato con hash distinti', async () => {
    // Creiamo due dummy PDF validi con intestazione %PDF-1.4 e contenuto differente
    const originalPdfHeader = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF ORIGINAL SOURCE BINARY';
    const normalizedPdfHeader = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF NORMALIZED A4 RECTIFIED BINARY';

    const originalBytes = new TextEncoder().encode(originalPdfHeader);
    const normalizedBytes = new TextEncoder().encode(normalizedPdfHeader);

    const sourceSha256 = await computeSha256(originalBytes);
    const normalizedSha256 = await computeSha256(normalizedBytes);

    expect(sourceSha256).not.toBe(normalizedSha256);

    const templateId = 'CUSTOM_TEST_TEMPLATE_01';
    const record: PersistedTemplateRecord = {
      templateId,
      name: 'PEI Comune di Roma Test',
      schoolOrder: 'A2',
      sourceFileName: 'PEI Comune di ROMA def.pdf',
      sourceSha256,
      normalizedSha256,
      normalizationSucceeded: true,
      fileSizeBytes: originalBytes.byteLength,
      pageCount: 12,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'REVIEW_REQUIRED',
      pages: [],
    };

    // Salva record con entrambi i binari
    await saveCustomTemplate(record, normalizedBytes, originalBytes);

    // 1. Verifica recupero binario originale
    const origResult = await getOriginalTemplatePdfBinary(record);
    expect(origResult).not.toBeNull();
    expect(origResult?.sha256).toBe(sourceSha256);
    expect(origResult?.sizeBytes).toBe(originalBytes.byteLength);

    // 2. Verifica recupero binario elaborato/normalizzato
    const normResult = await getNormalizedTemplatePdfBinary(record);
    expect(normResult).not.toBeNull();
    expect(normResult?.sha256).toBe(normalizedSha256);
    expect(normResult?.sizeBytes).toBe(normalizedBytes.byteLength);
    expect(normResult?.sha256).not.toBe(origResult?.sha256);
  });

  it('se il binario elaborato manca, getNormalizedTemplatePdfBinary restituisce null senza restituire silenziosamente l originale', async () => {
    const originalPdfHeader = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF ORIGINAL SOURCE ONLY';
    const originalBytes = new TextEncoder().encode(originalPdfHeader);
    const sourceSha256 = await computeSha256(originalBytes);

    const templateId = 'TEMPLATE_WITHOUT_NORMALIZED';
    const record: PersistedTemplateRecord = {
      templateId,
      name: 'Modello Solo Originale',
      schoolOrder: 'A1',
      sourceFileName: 'original.pdf',
      sourceSha256,
      normalizedSha256: undefined, // nessun binario normalizzato registrato
      normalizationSucceeded: false,
      fileSizeBytes: originalBytes.byteLength,
      pageCount: 1,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'REVIEW_REQUIRED',
      pages: [],
    };

    // Salviamo SOLO il binario originale
    await saveCustomTemplate(record, undefined, originalBytes);

    // Verifica che getOriginalTemplatePdfBinary trovi l'originale
    const orig = await getOriginalTemplatePdfBinary(record);
    expect(orig).not.toBeNull();
    expect(orig?.sha256).toBe(sourceSha256);

    // Verifica che getNormalizedTemplatePdfBinary NON restituisca l'originale ma restituisca null
    const norm = await getNormalizedTemplatePdfBinary(record);
    expect(norm).toBeNull();
  });

  it('verifica corrispondenza biunivoca tra normalizedSha256 e il binario esportato', async () => {
    const normBytes = new TextEncoder().encode('%PDF-1.4\n% Canon A4 595.32x841.92 pt\n%%EOF');
    const normHash = await computeSha256(normBytes);

    const record: PersistedTemplateRecord = {
      templateId: 'CANONICAL_A4_RECORD',
      name: 'Modello A4 Test',
      schoolOrder: 'A3',
      sourceFileName: 'test.pdf',
      sourceSha256: 'a9b27df1bcfea401f98966105a8ae16b1cc46f6d5b1bd1720eb507838635dc63',
      normalizedSha256: normHash,
      normalizationSucceeded: true,
      fileSizeBytes: normBytes.byteLength,
      pageCount: 1,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'READY',
      pages: [],
    };

    await saveCustomTemplate(record, normBytes);

    const exported = await getNormalizedTemplatePdfBinary(record);
    expect(exported).not.toBeNull();
    expect(exported?.sha256).toBe(normHash);
    expect(Array.from(exported!.binary)).toEqual(Array.from(normBytes));
  });
});
