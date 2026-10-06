import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { processDocumentAcquisition } from '../core/documentAcquisitionService';
import { PdfDocumentAnalyzer } from '../core/canonical-template-engine/analyzer/pdfDocumentAnalyzer';
import { CanonicalTemplateEngine } from '../core/canonical-template-engine/canonicalTemplateEngine';
import { CteDecision } from '../core/canonical-template-engine/types';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../data/geometry/geometryTransform';

describe('PEI FACILE — Normalizzazione del Modello in Formato Pagina A4 (21 × 29,7 cm)', () => {
  const romaPdfPath = path.resolve(
    __dirname,
    '../../Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf'
  );
  const ministerialA1Path = path.resolve(
    __dirname,
    '../../public/models/ALLEGATO_A1_PEI_INFANZIA.pdf'
  );

  it('TEST 1: Verifica presenza ed integrità dei file fisici di test (Roma PDF e Allegato A1)', () => {
    expect(fs.existsSync(romaPdfPath)).toBe(true);
    expect(fs.existsSync(ministerialA1Path)).toBe(true);

    const romaStat = fs.statSync(romaPdfPath);
    const a1Stat = fs.statSync(ministerialA1Path);

    expect(romaStat.size).toBeGreaterThan(100000);
    expect(a1Stat.size).toBeGreaterThan(10000);
  });

  it('TEST 2: Normalizzazione in formato A4 (21 x 29,7 cm) del PDF Reale del Comune di Roma', async () => {
    const romaBuffer = fs.readFileSync(romaPdfPath);
    const analyzer = new PdfDocumentAnalyzer();

    // 1. Analisi preliminare del documento originale
    const origAnalysis = await analyzer.analyze(romaBuffer.buffer);
    expect(origAnalysis.totalPages).toBeGreaterThan(0);
    const origPage1 = origAnalysis.pages[0];

    // 2. Esecuzione dell'acquisizione con pipeline CTE di normalizzazione
    const acquisitionResult = await processDocumentAcquisition(
      romaBuffer.buffer,
      'PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf',
      {
        customOcrRunner: async () => ({ text: 'Mock OCR text', confidence: 90 }),
      }
    );

    expect(acquisitionResult.sourceBinary).toBeDefined();
    expect(acquisitionResult.canonicalDocument).toBeDefined();

    // 3. Verifica conservazione del documento originale
    expect(acquisitionResult.sourceBinary!.byteLength).toBe(romaBuffer.byteLength);

    // 4. Analisi del documento normalizzato
    const normAnalysis = await analyzer.analyze(
      acquisitionResult.canonicalDocument!.buffer
    );

    expect(normAnalysis.totalPages).toBe(origAnalysis.totalPages);

    // Ogni pagina del documento normalizzato deve essere esattamente in formato A4 (595.32 x 841.92 pt / 21 x 29,7 cm)
    for (let i = 0; i < normAnalysis.pages.length; i++) {
      const page = normAnalysis.pages[i];
      expect(Math.abs(page.width - A4_WIDTH_PT)).toBeLessThan(1.0);
      expect(Math.abs(page.height - A4_HEIGHT_PT)).toBeLessThan(1.0);
    }

    // 5. Verifica metadati di trasformazione delle coordinate
    expect(acquisitionResult.coordinateTransform).toBeDefined();
    const transform = acquisitionResult.coordinateTransform!;
    expect(transform.isNormalizedA4).toBe(true);
    expect(transform.targetSize.width).toBeCloseTo(A4_WIDTH_PT, 1);
    expect(transform.targetSize.height).toBeCloseTo(A4_HEIGHT_PT, 1);
    expect(transform.affineMatrix).toHaveLength(6);
    expect(transform.inverseMatrix).toHaveLength(6);

    // 6. Verifica preservazione dei contenuti e della struttura del modello acquisito
    const origHasContent = origAnalysis.hasRaster || origAnalysis.hasImages || origAnalysis.hasVectors || origAnalysis.hasText;
    const normHasContent = normAnalysis.hasRaster || normAnalysis.hasImages || normAnalysis.hasVectors || normAnalysis.hasText;
    expect(normHasContent).toBe(origHasContent);
    expect(normAnalysis.totalPages).toBe(origAnalysis.totalPages);
  }, 30000);

  it('TEST 3: Controllo di Regressione su Modello Ministeriale Allegato A1', async () => {
    const a1Buffer = fs.readFileSync(ministerialA1Path);
    const analyzer = new PdfDocumentAnalyzer();

    const origAnalysis = await analyzer.analyze(a1Buffer.buffer);
    const acquisitionResult = await processDocumentAcquisition(
      a1Buffer.buffer,
      'ALLEGATO_A1_PEI_INFANZIA.pdf',
      {
        customOcrRunner: async () => ({ text: 'Mock OCR text', confidence: 90 }),
      }
    );

    expect(acquisitionResult.canonicalDocument).toBeDefined();
    const normAnalysis = await analyzer.analyze(
      acquisitionResult.canonicalDocument!.buffer
    );

    expect(normAnalysis.totalPages).toBe(origAnalysis.totalPages);
    expect(Math.abs(normAnalysis.pages[0].width - A4_WIDTH_PT)).toBeLessThan(1.0);
    expect(Math.abs(normAnalysis.pages[0].height - A4_HEIGHT_PT)).toBeLessThan(1.0);
  }, 30000);

  it('TEST 4: Salvataggio e Riapertura mantengono lo sfondo e il sistema di coordinate', async () => {
    const romaBuffer = fs.readFileSync(romaPdfPath);
    const acquisitionResult = await processDocumentAcquisition(
      romaBuffer.buffer,
      'PEI_Comune_Roma_Infanzia.pdf',
      {
        customOcrRunner: async () => ({ text: 'Mock OCR text', confidence: 90 }),
      }
    );

    const savedCanonical = acquisitionResult.canonicalDocument!;
    const savedTransform = acquisitionResult.coordinateTransform!;

    // Simuliamo riapertura dal layer di persistenza
    const reopenedBuffer = new Uint8Array(savedCanonical.slice(0));
    const analyzer = new PdfDocumentAnalyzer();
    const reopenedAnalysis = await analyzer.analyze(reopenedBuffer.buffer);

    expect(reopenedAnalysis.totalPages).toBe(acquisitionResult.totalPages);
    expect(Math.abs(reopenedAnalysis.pages[0].width - A4_WIDTH_PT)).toBeLessThan(1.0);
    expect(Math.abs(reopenedAnalysis.pages[0].height - A4_HEIGHT_PT)).toBeLessThan(1.0);

    // Verifica la validità ed invertibilità della matrice di trasformazione salvata
    const [a, b, c, d, e, f] = savedTransform.affineMatrix;
    const [invA, invB, invC, invD, invE, invF] = savedTransform.inverseMatrix;

    // Test applicazione forward e inverse su un punto arbitrario (100, 100)
    const origX = 100;
    const origY = 100;

    const normX = a * origX + c * origY + e;
    const normY = b * origX + d * origY + f;

    const restoredX = invA * normX + invC * normY + invE;
    const restoredY = invB * normX + invD * normY + invF;

    expect(restoredX).toBeCloseTo(origX, 1);
    expect(restoredY).toBeCloseTo(origY, 1);
  }, 30000);
});
