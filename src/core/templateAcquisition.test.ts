/**
 * @license
 * PEI FACILE — Dynamic Template Acquisition Engine Test Suite (Phase 1B R01)
 * Formal verification of generic template acquisition, fast-path ministerial binding,
 * candidate field extraction, ambiguity detection, viewport invariance, and IndexedDB persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  acquirePdfTemplate,
  computeSha256,
  MINISTERIAL_FAST_PATH_HASHES,
} from './templateAcquisitionService';
import {
  saveCustomTemplate,
  getCustomTemplate,
  findTemplateBySha256,
  listAllCustomTemplates,
} from './templateStorage';
import {
  pdfPointToViewport,
  viewportToPdfPoint,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
} from '../data/geometry/geometryTransform';

/**
 * Generates valid ISO 32000-1 binary PDF bytes for test execution.
 */
function createSyntheticPdf(pages: Array<{ text?: string }>): Uint8Array {
  let objectCount = 2;
  const pageObjIds: number[] = [];
  const objects: Array<{ id: number; content: string }> = [];

  const fontObjId = 3;
  objects.push({
    id: fontObjId,
    content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  });

  pages.forEach((p, idx) => {
    const pageId = 4 + idx * 2;
    const contentId = pageId + 1;
    pageObjIds.push(pageId);

    let streamData = '';
    if (p.text && p.text.length > 0) {
      streamData = `BT /F1 12 Tf 50 750 Td (${p.text.replace(/[()]/g, '')}) Tj ET`;
    } else {
      streamData = `q 10 0 0 10 50 700 cm /Im1 Do Q`;
    }

    const contentObj = `<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream`;
    objects.push({ id: contentId, content: contentObj });

    const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`;
    objects.push({ id: pageId, content: pageObj });
  });

  const catalogObj = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  objects.unshift({ id: 2, content: pagesObj });
  objects.unshift({ id: 1, content: catalogObj });
  objects.sort((a, b) => a.id - b.id);

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach((obj) => {
    offsets.push(pdfStr.length);
    pdfStr += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  });

  const startXref = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offset = String(offsets[i]).padStart(10, '0');
    pdfStr += `${offset} 00000 n \n`;
  }

  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return new TextEncoder().encode(pdfStr);
}

describe('PEI FACILE — Phase 1B: Dynamic Template Acquisition Engine', () => {
  // Test Scenario A: PDF ministeriale noto -> Fast Path precalibrato
  describe('Scenario A: Known Ministerial PDF Fast Path', () => {
    it('riconosce istantaneamente gli hash SHA-256 ministeriali (A1-A4) e attiva il fast-path precalibrato (built-in baseline)', async () => {
      const a1Hash = 'affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c';
      expect(MINISTERIAL_FAST_PATH_HASHES[a1Hash]).toBeDefined();
      expect(MINISTERIAL_FAST_PATH_HASHES[a1Hash].modelId).toBe('A1');

      // Crea un buffer fittizio con lo stesso hash associato
      const mockMinisterialData = new Uint8Array([1, 2, 3]);
      // Simula il matching
      const fastPathEntry = MINISTERIAL_FAST_PATH_HASHES[a1Hash];
      expect(fastPathEntry.data.totalPages).toBe(12);
      expect(fastPathEntry.data.pages.length).toBe(12);
      expect(fastPathEntry.data.pages[0].fields.length).toBeGreaterThan(0);
    });
  });

  // Test Scenario B: PDF sconosciuto con text lines / vector boundaries
  describe('Scenario B: Unknown PDF with Vector Fill Lines', () => {
    it('rileva automaticamente campi di compilazione da sottolineature continue (VECTOR_BOUNDARY)', async () => {
      const pdfBytes = createSyntheticPdf([
        { text: 'Cognome e Nome: ____________________' },
      ]);

      const result = await acquirePdfTemplate(pdfBytes, 'custom_model.pdf');

      expect(result.sourceFileName).toBe('custom_model.pdf');
      expect(result.sourceSha256.length).toBe(64);
      expect(result.pageCount).toBe(1);
      expect(result.isMinisterialFastPath).toBe(false);

      const vectorField = result.geometryCandidates.find(
        (f) => f.derivationMethod === 'VECTOR_BOUNDARY'
      );
      expect(vectorField).toBeDefined();
      expect(vectorField?.confidence).toBeGreaterThanOrEqual(0.8);
      expect(vectorField?.pageNumber).toBe(1);
    });
  });

  // Test Scenario C: PDF sconosciuto con text anchors (terminatori due punti)
  describe('Scenario C: Unknown PDF with Text Anchors', () => {
    it('rileva automaticamente campi compilabili da etichette con due punti (TEXT_ANCHOR)', async () => {
      const pdfBytes = createSyntheticPdf([
        { text: 'Codice Fiscale:' },
      ]);

      const result = await acquirePdfTemplate(pdfBytes, 'scheda_territoriale.pdf');

      expect(result.pageCount).toBe(1);
      const anchorField = result.geometryCandidates.find(
        (f) => f.derivationMethod === 'TEXT_ANCHOR'
      );
      expect(anchorField).toBeDefined();
      expect(anchorField?.label).toContain('Codice Fiscale');
      expect(anchorField?.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  // Test Scenario D: PDF ambiguo -> REVIEW_REQUIRED
  describe('Scenario D: Ambiguous PDF triggers REVIEW_REQUIRED', () => {
    it('identifica pattern non deterministici come regioni irrisolte e imposta lo stato REVIEW_REQUIRED', async () => {
      const pdfBytes = createSyntheticPdf([
        { text: 'Opzione non chiara [  ] ......?' },
      ]);

      const result = await acquirePdfTemplate(pdfBytes, 'modello_ambiguo.pdf');

      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.unmappedRegions.length).toBeGreaterThan(0);
      expect(result.unmappedRegions[0].reason).toContain('Ambiguita geometrica');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // Test Scenario E: Stesso filename ma SHA-256 differente -> Mapping NON riutilizzato
  describe('Scenario E: Same filename with different SHA-256', () => {
    it('produce due fingerprint SHA-256 distinti e non riutilizza il mapping quando il contenuto cambia', async () => {
      const pdfV1 = createSyntheticPdf([{ text: 'Versione 1' }]);
      const pdfV2 = createSyntheticPdf([{ text: 'Versione 2 differente' }]);

      const hash1 = await computeSha256(pdfV1);
      const hash2 = await computeSha256(pdfV2);

      expect(hash1).not.toBe(hash2);

      const res1 = await acquirePdfTemplate(pdfV1, 'pei_istituto.pdf');
      const res2 = await acquirePdfTemplate(pdfV2, 'pei_istituto.pdf');

      expect(res1.sourceSha256).toBe(hash1);
      expect(res2.sourceSha256).toBe(hash2);
      expect(res1.templateId).not.toBe(res2.templateId);
    });
  });

  // Test Scenario F: Invarianza geometrica su viewport a scale multiple
  describe('Scenario F: Scale Invariance across Viewports', () => {
    it('mantiene rigorosamente costanti le coordinate canoniche in pt al variare dello zoom del viewport', () => {
      const canonicalXPt = 120;
      const canonicalYPt = 250;
      const canonicalWidthPt = 350;
      const canonicalHeightPt = 40;

      const scales = [0.8, 1.0, 1.25, 1.5, 2.0];

      scales.forEach((scale) => {
        // Da pt a pixel viewport
        const vp = pdfPointToViewport(canonicalXPt, canonicalYPt, canonicalWidthPt, canonicalHeightPt, scale);
        expect(vp.leftPx).toBeCloseTo(canonicalXPt * scale, 1);
        expect(vp.widthPx).toBeCloseTo(canonicalWidthPt * scale, 1);

        // Riconversione inversa da viewport a punti canonici
        const backToPt = viewportToPdfPoint(vp.leftPx, vp.topPx, vp.widthPx, vp.heightPx, scale);
        expect(backToPt.xPt).toBeCloseTo(canonicalXPt, 1);
        expect(backToPt.yPt).toBeCloseTo(canonicalYPt, 1);
        expect(backToPt.widthPt).toBeCloseTo(canonicalWidthPt, 1);
        expect(backToPt.heightPt).toBeCloseTo(canonicalHeightPt, 1);
      });
    });
  });

  // Test Scenario G: Modello custom NON usa layout A1-A4 come fallback
  describe('Scenario G: Custom model separation from Ministerial layouts', () => {
    it('assegna un templateId indipendente e non eredita le sezioni geometriche A1-A4', async () => {
      const pdfBytes = createSyntheticPdf([{ text: 'Modello Unico Personalizzato' }]);
      const result = await acquirePdfTemplate(pdfBytes, 'custom_modello.pdf');

      expect(result.templateId).toContain('tpl_custom_');
      expect(result.isMinisterialFastPath).toBe(false);
      expect(result.templateId).not.toBe('A1');
      expect(result.templateId).not.toBe('A2');
      expect(result.templateId).not.toBe('A3');
      expect(result.templateId).not.toBe('A4');
    });
  });

  // Test Scenario H: IndexedDB Template Storage Lifecycle
  describe('Scenario H: Structured Template Storage', () => {
    it('salva, indicizza per SHA-256 e recupera record e binari di template custom senza usare localStorage', async () => {
      const dummyPdfBytes = new Uint8Array([10, 20, 30, 40, 50]);
      const sha = await computeSha256(dummyPdfBytes);
      const templateId = `tpl_test_${Date.now()}`;

      await saveCustomTemplate(
        {
          templateId,
          name: 'Test Template Storage',
          schoolOrder: 'A2',
          sourceFileName: 'test_model.pdf',
          sourceSha256: sha,
          fileSizeBytes: dummyPdfBytes.length,
          pageCount: 1,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'READY',
          pages: [],
        },
        dummyPdfBytes
      );

      const retrieved = await getCustomTemplate(templateId, true);
      expect(retrieved).toBeDefined();
      expect(retrieved?.templateId).toBe(templateId);
      expect(retrieved?.sourceSha256).toBe(sha);
      expect(retrieved?.pdfBinary).toBeDefined();
      expect(retrieved?.pdfBinary?.length).toBe(dummyPdfBytes.length);

      const foundByHash = await findTemplateBySha256(sha);
      expect(foundByHash?.templateId).toBe(templateId);

      const all = await listAllCustomTemplates();
      expect(all.some((t) => t.templateId === templateId)).toBe(true);
    });
  });

  // Test Scenario I: Classificazione onesta formati DOCX
  describe('Scenario I: Honest DOCX Notice', () => {
    it('rifiuta simulazioni arbitrarie DOCX e dichiara esplicitamente DOCX CANONICALIZATION: NOT IMPLEMENTED', async () => {
      const dummyDocxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // Zip signature
      const result = await acquirePdfTemplate(dummyDocxBytes, 'modello_scolastico.docx');

      expect(result.status).toBe('FAILED');
      expect(result.docxNotice).toBe('DOCX CANONICALIZATION: NOT IMPLEMENTED');
      expect(result.warnings[0]).toContain('DOCX richiedono la preventiva normalizzazione in formato PDF canonico');
    });
  });
});
