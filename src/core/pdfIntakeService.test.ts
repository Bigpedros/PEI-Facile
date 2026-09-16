/**
 * @license
 * PEI FACILE — PDF Intake Service Unit & Integration Tests (Blocco 1 R1)
 * Test obbligatori A (Digitale), B (Raster), C (Eterogeneo/Multipagina)
 * Test con veri stream di byte PDF sintetici e anonimi al 100% analizzati da PDF.js.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyPageContent,
  normalizeInputData,
  processPdfDocument,
} from './pdfIntakeService';
import { PdfIntakeOcrResult } from './pdfIntakeTypes';

/**
 * Generatore di vero documento PDF sintetico conforme a standard ISO 32000-1 (PDF 1.4).
 * Produce un flusso binario reale interpretabile direttamente da PDF.js (senza mock di PDF.js).
 */
function createSyntheticPdf(pages: Array<{ text?: string }>): Uint8Array {
  let objectCount = 2;
  const pageObjIds: number[] = [];
  const objects: Array<{ id: number; content: string }> = [];

  // Font Type1 standard
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
      // Flusso vettoriale di testo digitale nativo con coordinate posizionali
      streamData = `BT /F1 12 Tf 50 750 Td (${p.text.replace(/[()]/g, '')}) Tj ET`;
    } else {
      // Flusso privo di testo (equivalente a scansione / raster)
      streamData = `q 10 0 0 10 50 700 cm /Im1 Do Q`;
    }

    const contentObj = `<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream`;
    objects.push({ id: contentId, content: contentObj });

    const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`;
    objects.push({ id: pageId, content: pageObj });
  });

  const catalogObj = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  objects.unshift({ id: 2, content: pagesObj });
  objects.unshift({ id: 1, content: catalogObj });

  objects.sort((a, b) => a.id - b.id);

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach(obj => {
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

  const encoder = new TextEncoder();
  return encoder.encode(pdfStr);
}

describe('Blocco 1 R1 — PDF Intake Tecnico', () => {
  describe('Classificazione Tecnica Pagina (Conservativa)', () => {
    it('classifica come TEXT_NATIVE una pagina con testo e nessun elemento raster', () => {
      const type = classifyPageContent(120, 0);
      expect(type).toBe('TEXT_NATIVE');
    });

    it('classifica come IMAGE_ONLY una pagina senza testo nativo', () => {
      const type = classifyPageContent(0, 1);
      expect(type).toBe('IMAGE_ONLY');
    });

    it('classifica come MIXED_UNRESOLVED una pagina con presenza contemporanea di testo e raster', () => {
      const type = classifyPageContent(18, 1);
      expect(type).toBe('MIXED_UNRESOLVED');
    });
  });

  describe('Normalizzazione Input', () => {
    it('accetta Uint8Array e ArrayBuffer', async () => {
      const sample = new Uint8Array([1, 2, 3]);
      const res1 = await normalizeInputData(sample);
      expect(res1).toBeInstanceOf(Uint8Array);

      const res2 = await normalizeInputData(sample.buffer);
      expect(res2).toBeInstanceOf(Uint8Array);
    });
  });

  describe('TEST A — PDF con Testo Digitale Nativo (Integrazione con vero PDF sintetico)', () => {
    it('estrae il testo nativo con ZERO chiamate a Tesseract e preserva metadati e coordinate', async () => {
      const syntheticPdf = createSyntheticPdf([
        { text: 'PIANO EDUCATIVO INDIVIDUALIZZATO - MODELLO SINTETICO SCUOLA SECONDARIA' },
      ]);

      const ocrRunnerMock = vi.fn();

      const result = await processPdfDocument(syntheticPdf, 'test_nativo.pdf', {
        customOcrRunner: ocrRunnerMock,
      });

      expect(result.fileName).toBe('test_nativo.pdf');
      expect(result.totalPages).toBe(1);
      expect(result.textNativePageCount).toBe(1);
      expect(result.imageOnlyPageCount).toBe(0);
      expect(result.mixedPageCount).toBe(0);

      const page1 = result.pages[0];
      expect(page1.pageNumber).toBe(1);
      expect(page1.pageType).toBe('TEXT_NATIVE');
      expect(page1.text).toContain('PIANO EDUCATIVO INDIVIDUALIZZATO');
      expect(page1.nativeItems).toBeDefined();
      expect(page1.nativeItems!.length).toBeGreaterThan(0);

      // Coordinate native
      const firstItem = page1.nativeItems![0];
      expect(firstItem.x).toBe(50);
      expect(firstItem.y).toBe(750);

      // VERIFICA FONDAMENTALE: ZERO chiamate OCR per PDF nativo
      expect(ocrRunnerMock).toHaveBeenCalledTimes(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('TEST B — PDF Raster Puro (Scansione) (Integrazione con vero PDF sintetico)', () => {
    it('riconosce pagina raster e instrada verso il motore OCR restituendo testo e confidence', async () => {
      const syntheticRasterPdf = createSyntheticPdf([
        { text: '' }, // Pagina senza text layer nativo
      ]);

      const mockOcrResult: PdfIntakeOcrResult = {
        text: 'TESTO RICONOSCIUTO DA SCANSIONE SINTETICA OCR',
        confidence: 88.5,
        variant: 'gentle_contrast',
      };

      const ocrRunnerMock = vi.fn().mockResolvedValue(mockOcrResult);

      const result = await processPdfDocument(syntheticRasterPdf, 'test_scansione.pdf', {
        customOcrRunner: ocrRunnerMock,
      });

      expect(result.totalPages).toBe(1);
      expect(result.textNativePageCount).toBe(0);
      expect(result.imageOnlyPageCount).toBe(1);

      const page1 = result.pages[0];
      expect(page1.pageType).toBe('IMAGE_ONLY');
      expect(page1.text).toBe('TESTO RICONOSCIUTO DA SCANSIONE SINTETICA OCR');
      expect(page1.ocrConfidence).toBe(88.5);
      expect(page1.ocrVariantUsed).toBe('gentle_contrast');
      expect(page1.hasWarnings).toBe(true);

      // VERIFICA FONDAMENTALE: 1 chiamata OCR per pagina raster
      expect(ocrRunnerMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('TEST C — PDF Multipagina Eterogeneo (Misto) (Integrazione con vero PDF sintetico)', () => {
    it('elabora indipendentemente Pagina 1 (Digitale) e Pagina 2 (Raster) con due percorsi distinti', async () => {
      const syntheticMixedDoc = createSyntheticPdf([
        { text: 'PAGINA 1 DI TESTO NATIVO MINISTERIALE SINTETICO' }, // Pagina 1: Nativa
        { text: '' }, // Pagina 2: Raster pura
      ]);

      const mockOcrResult: PdfIntakeOcrResult = {
        text: 'ALLEGATO SCANSIONATO CON FIRME E TIMBRI',
        confidence: 82.0,
        variant: 'sharpened_light',
      };

      const ocrRunnerMock = vi.fn().mockResolvedValue(mockOcrResult);

      const result = await processPdfDocument(syntheticMixedDoc, 'documento_misto.pdf', {
        customOcrRunner: ocrRunnerMock,
      });

      expect(result.totalPages).toBe(2);
      expect(result.textNativePageCount).toBe(1);
      expect(result.imageOnlyPageCount).toBe(1);

      // Pagina 1 (Nativa)
      const p1 = result.pages[0];
      expect(p1.pageNumber).toBe(1);
      expect(p1.pageType).toBe('TEXT_NATIVE');
      expect(p1.text).toContain('PAGINA 1 DI TESTO NATIVO');

      // Pagina 2 (Raster)
      const p2 = result.pages[1];
      expect(p2.pageNumber).toBe(2);
      expect(p2.pageType).toBe('IMAGE_ONLY');
      expect(p2.text).toContain('ALLEGATO SCANSIONATO');
      expect(p2.ocrConfidence).toBe(82.0);

      // OCR invocato SOLO per la pagina 2
      expect(ocrRunnerMock).toHaveBeenCalledTimes(1);
    });
  });
});
