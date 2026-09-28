import { describe, it, expect } from 'vitest';
import { resolveTemplateSource, TemplateSourceError } from '../core/templateSourceResolver';
import { MINISTERIAL_CANONICAL_MAP } from '../data/peiModelRegistry';
import { AffineMatrix } from '../core/canonical-template-engine/execution/affineMatrix';
import { pdfPointToViewport, A4_WIDTH_PT, A4_HEIGHT_PT } from '../data/geometry/geometryTransform';
import { PDFDocument } from 'pdf-lib';

describe('CTE-FIX-01 — Regression Test Suite', () => {
  // =========================================================================
  // TEST A: canonicalDocument presente -> il compilatore utilizza canonicalDocument
  // e NON ricarica il built-in ministeriale
  // =========================================================================
  it('TEST A: canonicalDocument presente -> il compilatore utilizza canonicalDocument e non viene scartato', async () => {
    // Creiamo un PDF sintetico che simula il canonicalDocument prodotto da CTE R10
    const syntheticPdf = await PDFDocument.create();
    syntheticPdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const syntheticBytes = await syntheticPdf.save();

    const resolved = await resolveTemplateSource({
      schoolOrder: 'A2',
      providedBinary: syntheticBytes,
    });

    expect(resolved).toBeDefined();
    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.schoolOrder).toBe('A2');
    // Il buffer deve essere esattamente quello passato da CTE
    expect(resolved.sourceBinary).toBe(syntheticBytes);
    expect(resolved.templateSchema).toBeDefined();
    expect(resolved.geometryMapping).toBeDefined();
    expect(resolved.calibrationStatus).toBe('CALIBRATED');
  });

  // =========================================================================
  // TEST B: canonicalDocument assente -> comportamento ministeriale precedente invariato
  // =========================================================================
  it('TEST B: canonicalDocument assente -> carica il PDF ministeriale built-in con verifica integrità', async () => {
    const resolved = await resolveTemplateSource({
      schoolOrder: 'A1',
    });

    expect(resolved).toBeDefined();
    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.schoolOrder).toBe('A1');
    expect(resolved.sourceBinary).toBeDefined();
    expect(resolved.sourceBinary.byteLength).toBeGreaterThan(0);
    expect(resolved.sourceSha256).toBe(MINISTERIAL_CANONICAL_MAP.A1.sourceSha256);
  });

  // =========================================================================
  // TEST C: Traslazione verticale positiva e negativa -> conversione Top-Left / Bottom-Left
  // =========================================================================
  it('TEST C: Traslazione verticale positiva e negativa -> conversione Top-Left / Bottom-Left corretta', () => {
    // Scenario 1: Margine superiore troppo piccolo (content shifted UP towards top)
    // top = 20 pt, target = 36 pt -> marginCorrection.top = +16 pt (desideriamo spostare il contenuto in BASSO)
    // In coordinate Top-Left (schermo): +Y va verso il basso.
    // In coordinate Bottom-Left (PDF User Space): +Y va verso l'alto, quindi per spostare in BASSO il valore deve essere NEGATIVO (-16 pt).
    const top1 = 20;
    const bottom1 = 52;
    const targetMargin = 36;
    const corrTop1 = targetMargin - top1; // +16
    const corrBottom1 = targetMargin - bottom1; // -16

    const dy1 = (corrBottom1 - corrTop1) / 2; // (-16 - 16) / 2 = -16 pt (PDF User Space)
    expect(dy1).toBe(-16);

    const matrix1 = AffineMatrix.translation(0, dy1);
    const transformedPoint1 = matrix1.transformPoint(100, 500); // Punto nello spazio PDF
    expect(transformedPoint1.y).toBe(484); // 500 - 16 = 484 pt (spostato verso il basso)

    // Scenario 2: Margine inferiore troppo piccolo (content shifted DOWN towards bottom)
    // bottom = 20 pt, top = 52 pt -> marginCorrection.top = -16 pt, marginCorrection.bottom = +16 pt
    const top2 = 52;
    const bottom2 = 20;
    const corrTop2 = targetMargin - top2; // -16
    const corrBottom2 = targetMargin - bottom2; // +16

    const dy2 = (corrBottom2 - corrTop2) / 2; // (16 - (-16)) / 2 = +16 pt (PDF User Space)
    expect(dy2).toBe(16);

    const matrix2 = AffineMatrix.translation(0, dy2);
    const transformedPoint2 = matrix2.transformPoint(100, 500);
    expect(transformedPoint2.y).toBe(516); // 500 + 16 = 516 pt (spostato verso l'alto)
  });

  // =========================================================================
  // TEST D: Documento normalizzato + TemplateSchema -> stessa geometria canonica A4
  // =========================================================================
  it('TEST D: Documento normalizzato + TemplateSchema -> stessa geometria canonica A4', async () => {
    const resolved = await resolveTemplateSource({
      schoolOrder: 'A3',
    });

    expect(resolved.templateSchema.pages.length).toBeGreaterThan(0);
    const firstPage = resolved.templateSchema.pages[0];
    expect(firstPage.widthPt).toBeCloseTo(A4_WIDTH_PT, 1);
    expect(firstPage.heightPt).toBeCloseTo(A4_HEIGHT_PT, 1);

    // Tutti i campi devono avere coordinate non negative e all'interno dei limiti A4
    for (const field of resolved.templateSchema.fields) {
      expect(field.geometry.xPt).toBeGreaterThanOrEqual(0);
      expect(field.geometry.yPt).toBeGreaterThanOrEqual(0);
      expect(field.geometry.xPt + field.geometry.widthPt).toBeLessThanOrEqual(A4_WIDTH_PT + 5);
      expect(field.geometry.yPt + field.geometry.heightPt).toBeLessThanOrEqual(A4_HEIGHT_PT + 5);
    }
  });

  // =========================================================================
  // TEST E: Nessuna double transform (invarianza della trasformazione di scala)
  // =========================================================================
  it('TEST E: Nessuna double transform tra PDF.js canvas e FieldOverlay', () => {
    const xPt = 100;
    const yPt = 200;
    const widthPt = 300;
    const heightPt = 40;

    // A scala 1.0
    const vp1 = pdfPointToViewport(xPt, yPt, widthPt, heightPt, 1.0);
    expect(vp1.leftPx).toBe(100);
    expect(vp1.topPx).toBe(200);
    expect(vp1.widthPx).toBe(300);
    expect(vp1.heightPx).toBe(40);

    // A scala 1.5
    const vp15 = pdfPointToViewport(xPt, yPt, widthPt, heightPt, 1.5);
    expect(vp15.leftPx).toBe(150);
    expect(vp15.topPx).toBe(300);
    expect(vp15.widthPx).toBe(450);
    expect(vp15.heightPx).toBe(60);

    // Il rapporto tra le due posizioni è esattamente la scala (senza trasformazioni parassite)
    expect(vp15.leftPx / vp1.leftPx).toBeCloseTo(1.5, 3);
    expect(vp15.topPx / vp1.topPx).toBeCloseTo(1.5, 3);
  });
});
