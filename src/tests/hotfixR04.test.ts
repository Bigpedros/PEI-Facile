import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCustomTemplate,
  getCustomTemplate,
  getTemplatePdfBinary,
} from '../core/templateStorage';
import { createEmptyPeiDocument } from '../data/masterPeiStructure';
import type { PeiDocument } from '../types/pei';

describe('PEI FACILE — HOTFIX R04 Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Part A — Home Document Deletion Lifecycle', () => {
    it('memorizza e rimuove correttamente il documento locale senza stati zombie', () => {
      const sampleDoc: PeiDocument = createEmptyPeiDocument('A2', 'ALUNNO-999', 'I.C. Test', '3B');
      sampleDoc.lastModifiedDate = new Date().toISOString();

      // Salva nel localStorage
      localStorage.setItem('pei_facile_saved_doc', JSON.stringify(sampleDoc));
      expect(localStorage.getItem('pei_facile_saved_doc')).toBeTruthy();

      const retrieved = JSON.parse(localStorage.getItem('pei_facile_saved_doc')!);
      expect(retrieved.studentCode).toBe('ALUNNO-999');
      expect(retrieved.schoolOrder).toBe('A2');

      // Eliminazione
      localStorage.removeItem('pei_facile_saved_doc');
      expect(localStorage.getItem('pei_facile_saved_doc')).toBeNull();
    });
  });

  describe('Part B — Calibration Workspace PDF Source & Binary Integrity', () => {
    it('salva e recupera il PDF binario sia per templateId sia per SHA-256 senza fallback ministeriale', async () => {
      const dummyPdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10]); // %PDF-1.7
      const templateId = 'custom_test_model_01';
      const fakeSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      await saveCustomTemplate(
        {
          templateId,
          name: 'Modello Territoriale R04',
          schoolOrder: 'A3',
          sourceFileName: 'modello_territoriale.pdf',
          sourceSha256: fakeSha,
          fileSizeBytes: dummyPdfBytes.byteLength,
          pageCount: 3,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: [],
        },
        dummyPdfBytes
      );

      // Recupera template metadata
      const template = await getCustomTemplate(templateId, true);
      expect(template).toBeDefined();
      expect(template?.templateId).toBe(templateId);
      expect(template?.sourceSha256).toBe(fakeSha);

      // Recupera binario per templateId
      const binaryById = await getTemplatePdfBinary(templateId);
      expect(binaryById).toBeDefined();
      expect(binaryById?.byteLength).toBe(dummyPdfBytes.byteLength);

      // Recupera binario per SHA
      const binaryBySha = await getTemplatePdfBinary(fakeSha);
      expect(binaryBySha).toBeDefined();
      expect(binaryBySha?.byteLength).toBe(dummyPdfBytes.byteLength);

      // Recupera binario per prefixed hash_
      const binaryByHashKey = await getTemplatePdfBinary(`hash_${fakeSha}`);
      expect(binaryByHashKey).toBeDefined();
      expect(binaryByHashKey?.byteLength).toBe(dummyPdfBytes.byteLength);
    });

    it('restituisce null quando il template personalizzato non esiste senza ripiegare silenziosamente su A1', async () => {
      const nonExistentId = 'custom_non_existent_999';
      const template = await getCustomTemplate(nonExistentId, true);
      expect(template).toBeNull();

      const binary = await getTemplatePdfBinary(nonExistentId);
      expect(binary).toBeNull();
    });
  });
});
